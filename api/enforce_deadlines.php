<?php
/**
 * PokeFodase - Server-Side Deadline Enforcement
 * 
 * This file provides a single function that checks and enforces all phase deadlines
 * for a given room. It is called from the SSE loop on every tick so that even if
 * all players close their browsers, the game continues autonomously.
 * 
 * Each phase has its own enforcement logic:
 * - Initial (starter selection): auto-pick for timed-out player
 * - Catching: auto-catch with regular ball for timed-out player
 * - Town: auto-ready all players when timer expires
 * - Battle (casual): auto-select pokemon / auto-execute turn on timeout
 * - Battle (ranked): same, but for each concurrent match
 */

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/broadcast.php';

/**
 * Main enforcement entry point. Called from SSE loop.
 * Returns true if any action was taken.
 */
function enforceRoomDeadlines($roomId) {
    $db = getDB();
    
    // Read current room state (lightweight, no lock yet — each enforcer locks internally)
    $stmt = $db->prepare("SELECT game_state, game_data, game_mode, current_route FROM rooms WHERE id = ?");
    $stmt->execute([$roomId]);
    $room = $stmt->fetch();
    
    if (!$room) return false;
    
    $state = $room['game_state'];
    $gd = $room['game_data'] ? json_decode($room['game_data'], true) : [];
    
    switch ($state) {
        case 'initial':
            $deadline = $gd['selection_deadline'] ?? null;
            if ($deadline && time() > $deadline) {
                // Delegate to pokemon.php enforcer
                require_once __DIR__ . '/pokemon.php';
                return enforceSelectionDeadline($db, $roomId, $room);
            }
            break;
            
        case 'catching':
            $deadline = $gd['turn_deadline'] ?? null;
            if ($deadline && time() > $deadline) {
                // Delegate to catching.php enforcer
                require_once __DIR__ . '/catching.php';
                return enforceCatchingDeadline($db, $roomId);
            }
            break;
            
        case 'town':
            $deadline = $gd['town_deadline'] ?? null;
            if ($deadline && time() > $deadline) {
                // Delegate to town.php enforcer
                require_once __DIR__ . '/town.php';
                return enforceTownDeadline($db, $roomId);
            }
            break;
            
        case 'battle':
            // Battle deadlines are inside the tournament game_data (battle_state or battle_states)
            return enforceBattleDeadlines($db, $roomId, $room, $gd);
            
        case 'tournament':
            if (($room['game_mode'] ?? 'casual') === 'ranked') {
                // First: if brackets exist and all are complete, auto-advance
                if (isset($gd['brackets'])) {
                    $allComplete = true;
                    $hasPending = false;
                    foreach ($gd['brackets'] as $b) {
                        if (($b['status'] ?? '') !== 'completed') $allComplete = false;
                        if (($b['status'] ?? '') === 'pending') $hasPending = true;
                    }
                    if ($allComplete) {
                        return enforceRankedTournamentComplete($db, $roomId, $room, $gd);
                    }
                    // If battles haven't been started yet and there are pending brackets,
                    // auto-start all battles after a delay (replaces client-side host-only countdown)
                    if ($hasPending && empty($gd['all_battles_started'])) {
                        return enforceRankedAutoStartBattles($db, $roomId, $room, $gd);
                    }
                } else {
                    // No brackets yet (game_data was NULL or missing brackets) —
                    // generate them now so the tournament can proceed
                    return enforceRankedGenerateBrackets($db, $roomId);
                }
            }
            break;
    }
    
    return false;
}

/**
 * Enforce battle phase deadlines (selection timeout, turn timeout).
 * Works for both casual (single battle_state) and ranked (multiple battle_states).
 */
function enforceBattleDeadlines($db, $roomId, $room, $gd) {
    $didAction = false;
    $isRanked = (($room['game_mode'] ?? 'casual') === 'ranked');
    
    if ($isRanked && isset($gd['battle_states'])) {
        // Ranked: check each concurrent battle
        foreach ($gd['battle_states'] as $matchIndex => $bs) {
            if (enforceSingleBattleDeadline($db, $roomId, $matchIndex, true)) {
                $didAction = true;
            }
        }
    } elseif (isset($gd['battle_state'])) {
        // Casual: single battle
        if (enforceSingleBattleDeadline($db, $roomId, null, false)) {
            $didAction = true;
        }
    }
    
    return $didAction;
}

/**
 * Enforce deadline for a single battle (selection or turn).
 * @param int|null $matchIndex - For ranked mode, the match index. Null for casual.
 * @param bool $isRanked
 */
function enforceSingleBattleDeadline($db, $roomId, $matchIndex, $isRanked) {
    // Use transaction with lock to prevent races
    $db->beginTransaction();
    try {
        $stmt = $db->prepare("SELECT game_state, game_data, current_route FROM rooms WHERE id = ? FOR UPDATE");
        $stmt->execute([$roomId]);
        $room = $stmt->fetch();
        
        if (!$room || $room['game_state'] !== 'battle') {
            $db->commit();
            return false;
        }
        
        $gd = $room['game_data'] ? json_decode($room['game_data'], true) : [];
        
        // Get the battle state
        if ($isRanked) {
            if (!isset($gd['battle_states'][$matchIndex])) {
                $db->commit();
                return false;
            }
            $battleState = &$gd['battle_states'][$matchIndex];
        } else {
            if (!isset($gd['battle_state'])) {
                $db->commit();
                return false;
            }
            $battleState = &$gd['battle_state'];
        }
        
        // Skip if battle is already finished
        if (($battleState['phase'] ?? '') === 'finished') {
            $db->commit();
            return false;
        }
        
        $selectionDeadline = $battleState['selection_deadline'] ?? null;
        $now = time();
        
        // SELECTION PHASE ENFORCEMENT
        if ($battleState['phase'] === 'selection' && $selectionDeadline && $now > $selectionDeadline) {
            $didAction = enforceSelectionTimeout($db, $roomId, $battleState, $gd, $matchIndex, $isRanked, $room);
            if ($didAction) {
                // Save updated state
                saveBattleState($db, $roomId, $gd, $battleState, $matchIndex, $isRanked);
                $db->commit();
                return true;
            }
        }
        
        // BATTLE TURN ENFORCEMENT
        // If the battle is in 'battle' phase and the turn_deadline has passed,
        // auto-execute the current turn (attack).
        if ($battleState['phase'] === 'battle') {
            $turnDeadline = $battleState['turn_deadline'] ?? null;
            if (!$turnDeadline) {
                // Legacy battle without turn_deadline — set one now so it'll be enforced next tick
                $battleState['turn_deadline'] = $now + 8;
                saveBattleState($db, $roomId, $gd, $battleState, $matchIndex, $isRanked);
                $db->commit();
                return true;
            }
            if ($now > $turnDeadline) {
                $didAction = enforceBattleTurnTimeout($db, $roomId, $battleState, $gd, $matchIndex, $isRanked, $room);
                if ($didAction) {
                    saveBattleState($db, $roomId, $gd, $battleState, $matchIndex, $isRanked);
                    $db->commit();
                    return true;
                }
            }
        }
        
        $db->commit();
        return false;
        
    } catch (\Exception $e) {
        $db->rollBack();
        error_log("enforceSingleBattleDeadline error: " . $e->getMessage());
        return false;
    }
}

/**
 * Handle selection timeout in battle: auto-select first non-fainted Pokemon
 * for the player(s) who haven't selected yet.
 */
function enforceSelectionTimeout(&$db, $roomId, &$battleState, &$gd, $matchIndex, $isRanked, $room) {
    $isNpcBattle = !empty($battleState['is_npc_battle']);
    
    // Determine who needs to select
    $p1NeedsSelect = ($battleState['player1_active'] === null);
    $p2NeedsSelect = ($battleState['player2_active'] === null);
    
    // Auto-select for player 1 if needed
    if ($p1NeedsSelect) {
        $idx = findFirstAvailablePokemon($battleState['player1_team']);
        if ($idx !== null) {
            $battleState['player1_active'] = $idx;
            $pokemon = $battleState['player1_team'][$idx];
            $player1 = getPlayerByIdSafe($db, $battleState['player1_id']);
            $eventType = $isRanked ? 'ranked_pokemon_selected' : 'battle_pokemon_selected';
            broadcastEvent($roomId, $eventType, [
                'match_index' => $matchIndex,
                'player_id' => $battleState['player1_id'],
                'player_name' => $player1 ? $player1['player_name'] : 'Player 1',
                'pokemon_name' => $pokemon['name'],
                'pokemon_sprite' => $pokemon['sprite_url'],
                'is_player1' => true,
                'team_index' => $idx,
                'auto_selected' => true
            ]);
        }
    }
    
    // Auto-select for player 2 if needed (skip NPC — NPC selects immediately)
    if ($p2NeedsSelect && !$isNpcBattle) {
        $idx = findFirstAvailablePokemon($battleState['player2_team']);
        if ($idx !== null) {
            $battleState['player2_active'] = $idx;
            $pokemon = $battleState['player2_team'][$idx];
            $player2 = getPlayerByIdSafe($db, $battleState['player2_id']);
            $eventType = $isRanked ? 'ranked_pokemon_selected' : 'battle_pokemon_selected';
            broadcastEvent($roomId, $eventType, [
                'match_index' => $matchIndex,
                'player_id' => $battleState['player2_id'],
                'player_name' => $player2 ? $player2['player_name'] : 'Player 2',
                'pokemon_name' => $pokemon['name'],
                'pokemon_sprite' => $pokemon['sprite_url'],
                'is_player1' => false,
                'team_index' => $idx,
                'auto_selected' => true
            ]);
        }
    }
    
    // If both now have active Pokemon, transition to battle phase
    if ($battleState['player1_active'] !== null && $battleState['player2_active'] !== null) {
        $p1Pokemon = $battleState['player1_team'][$battleState['player1_active']];
        $p2Pokemon = $battleState['player2_team'][$battleState['player2_active']];
        
        // Determine who goes first by speed
        if ($p1Pokemon['base_speed'] >= $p2Pokemon['base_speed']) {
            $battleState['current_turn'] = 'player1';
        } else {
            $battleState['current_turn'] = 'player2';
        }
        
        $battleState['phase'] = 'battle';
        $battleState['turn_deadline'] = time() + 8;
        unset($battleState['waiting_for']);
        
        $eventType = $isRanked ? 'ranked_battle_selections_complete' : 'battle_selections_complete';
        broadcastEvent($roomId, $eventType, [
            'match_index' => $matchIndex,
            'first_turn' => $battleState['current_turn'],
            'player1_active' => $battleState['player1_active'],
            'player2_active' => $battleState['player2_active']
        ]);
        
        return true;
    }
    
    return ($p1NeedsSelect || $p2NeedsSelect); // Return true if we did anything
}

/**
 * Find the first non-fainted Pokemon in a team.
 */
function findFirstAvailablePokemon($team) {
    foreach ($team as $index => $pokemon) {
        if (!$pokemon['is_fainted']) {
            return $index;
        }
    }
    return null;
}

/**
 * Save updated battle state back to game_data.
 */
function saveBattleState($db, $roomId, $gd, $battleState, $matchIndex, $isRanked) {
    if ($isRanked) {
        $gd['battle_states'][$matchIndex] = $battleState;
    } else {
        $gd['battle_state'] = $battleState;
    }
    $stmt = $db->prepare("UPDATE rooms SET game_data = ? WHERE id = ?");
    $stmt->execute([json_encode($gd), $roomId]);
}

/**
 * Type effectiveness chart (mirrors tournament.php getTypeMultiplier).
 */
function enforceGetTypeMultiplier($attackType, $defenseType) {
    $tc = [
        'normal'   => ['rock' => 0.5, 'steel' => 0.5, 'ghost' => 0.1],
        'fire'     => ['fire' => 0.5, 'water' => 0.5, 'rock' => 0.5, 'dragon' => 0.5, 'grass' => 2, 'ice' => 2, 'bug' => 2, 'steel' => 2],
        'water'    => ['water' => 0.5, 'grass' => 0.5, 'dragon' => 0.5, 'fire' => 2, 'ground' => 2, 'rock' => 2],
        'grass'    => ['fire' => 0.5, 'grass' => 0.5, 'poison' => 0.5, 'flying' => 0.5, 'bug' => 0.5, 'dragon' => 0.5, 'steel' => 0.5, 'water' => 2, 'ground' => 2, 'rock' => 2],
        'electric' => ['electric' => 0.5, 'grass' => 0.5, 'dragon' => 0.5, 'ground' => 0.1, 'water' => 2, 'flying' => 2],
        'ice'      => ['fire' => 0.5, 'water' => 0.5, 'ice' => 0.5, 'steel' => 0.5, 'grass' => 2, 'ground' => 2, 'flying' => 2, 'dragon' => 2],
        'fighting' => ['poison' => 0.5, 'flying' => 0.5, 'psychic' => 0.5, 'bug' => 0.5, 'ghost' => 0.1, 'normal' => 2, 'ice' => 2, 'rock' => 2, 'dark' => 2, 'steel' => 2],
        'poison'   => ['poison' => 0.5, 'ground' => 0.5, 'rock' => 0.5, 'ghost' => 0.5, 'steel' => 0.1, 'grass' => 2],
        'ground'   => ['grass' => 0.5, 'bug' => 0.5, 'flying' => 0.1, 'fire' => 2, 'electric' => 2, 'poison' => 2, 'rock' => 2, 'steel' => 2],
        'flying'   => ['electric' => 0.5, 'rock' => 0.5, 'steel' => 0.5, 'grass' => 2, 'fighting' => 2, 'bug' => 2],
        'psychic'  => ['psychic' => 0.5, 'steel' => 0.5, 'dark' => 0.1, 'fighting' => 2, 'poison' => 2],
        'bug'      => ['fire' => 0.5, 'fighting' => 0.5, 'poison' => 0.5, 'flying' => 0.5, 'ghost' => 0.5, 'steel' => 0.5, 'grass' => 2, 'psychic' => 2, 'dark' => 2],
        'rock'     => ['fighting' => 0.5, 'ground' => 0.5, 'steel' => 0.5, 'fire' => 2, 'ice' => 2, 'flying' => 2, 'bug' => 2],
        'ghost'    => ['dark' => 0.5, 'normal' => 0.1, 'psychic' => 2, 'ghost' => 2],
        'dragon'   => ['steel' => 0.5, 'dragon' => 2],
        'dark'     => ['fighting' => 0.5, 'dark' => 0.5, 'psychic' => 2, 'ghost' => 2],
        'steel'    => ['fire' => 0.5, 'water' => 0.5, 'electric' => 0.5, 'steel' => 0.5, 'ice' => 2, 'rock' => 2]
    ];
    return $tc[$attackType][$defenseType] ?? 1.0;
}

/**
 * Auto-execute a battle turn when the turn_deadline has passed.
 * Replicates the core attack logic from tournament.php execute_turn / execute_ranked_turn.
 * Loops to execute multiple turns if necessary (e.g. if enforcement was delayed).
 */
function enforceBattleTurnTimeout(&$db, $roomId, &$battleState, &$gd, $matchIndex, $isRanked, $room) {
    $maxIterations = 100; // safety: a battle can't have more than ~100 turns total
    $didAction = false;
    
    for ($iter = 0; $iter < $maxIterations; $iter++) {
        // Check we're still in battle phase with an expired deadline
        if (($battleState['phase'] ?? '') !== 'battle') break;
        $turnDeadline = $battleState['turn_deadline'] ?? null;
        if (!$turnDeadline || time() <= $turnDeadline) break;
        
        // Both active pokemon must be set
        if ($battleState['player1_active'] === null || $battleState['player2_active'] === null) break;
        
        $isPlayer1Turn = ($battleState['current_turn'] === 'player1');
        $isNpcBattle = !empty($battleState['is_npc_battle']);
        
        $attackerTeamKey = $isPlayer1Turn ? 'player1_team' : 'player2_team';
        $defenderTeamKey = $isPlayer1Turn ? 'player2_team' : 'player1_team';
        $attackerActiveKey = $isPlayer1Turn ? 'player1_active' : 'player2_active';
        $defenderActiveKey = $isPlayer1Turn ? 'player2_active' : 'player1_active';
        $attackerPlayerId = $isPlayer1Turn ? $battleState['player1_id'] : $battleState['player2_id'];
        $defenderPlayerId = $isPlayer1Turn ? $battleState['player2_id'] : $battleState['player1_id'];
        
        $attackerIsNpc = $isNpcBattle && !$isPlayer1Turn;
        $defenderIsNpc = $isNpcBattle && $isPlayer1Turn;
        
        $attacker = &$battleState[$attackerTeamKey][$battleState[$attackerActiveKey]];
        $defender = &$battleState[$defenderTeamKey][$battleState[$defenderActiveKey]];
        
        // Calculate damage
        $typeMultiplier = enforceGetTypeMultiplier($attacker['type_attack'], $defender['type_defense']);
        $damage = ceil($attacker['base_attack'] * 0.1 * $typeMultiplier);
        $damage = max(1, $damage);
        
        // Apply damage
        $defender['current_hp'] = max(0, $defender['current_hp'] - $damage);
        $defenderFainted = ($defender['current_hp'] <= 0);
        if ($defenderFainted) {
            $defender['is_fainted'] = true;
        }
        
        // Get names
        $attackerName = $attackerIsNpc 
            ? ($battleState['npc_data']['name'] ?? 'Líder de Ginásio')
            : (($p = getPlayerByIdSafe($db, $attackerPlayerId)) ? $p['player_name'] : 'Player');
        $defenderName = $defenderIsNpc 
            ? ($battleState['npc_data']['name'] ?? 'Líder de Ginásio')
            : (($p = getPlayerByIdSafe($db, $defenderPlayerId)) ? $p['player_name'] : 'Player');
        
        // Broadcast the attack
        $eventPrefix = $isRanked ? 'ranked_' : '';
        broadcastEvent($roomId, $eventPrefix . 'battle_attack', [
            'match_index' => $matchIndex,
            'attacker_id' => $attackerPlayerId,
            'attacker_name' => $attackerName,
            'attacker_pokemon' => $attacker['name'],
            'defender_pokemon' => $defender['name'],
            'damage' => $damage,
            'type_multiplier' => $typeMultiplier,
            'defender_hp' => $defender['current_hp'],
            'defender_max_hp' => $defender['battle_hp'],
            'defender_fainted' => $defenderFainted,
            'fainted' => $defenderFainted,
            'is_player1_attacking' => $isPlayer1Turn,
            'is_npc_battle' => $isNpcBattle,
            'attacker_is_npc' => $attackerIsNpc,
            'defender_is_npc' => $defenderIsNpc,
            'auto_enforced' => true
        ]);
        
        $didAction = true;
        
        if ($defenderFainted) {
            // Check if defender has any Pokemon left
            $defenderHasPokemon = false;
            foreach ($battleState[$defenderTeamKey] as $pokemon) {
                if (!$pokemon['is_fainted']) { $defenderHasPokemon = true; break; }
            }
            
            if (!$defenderHasPokemon) {
                // Battle over — attacker wins
                $winnerId = $attackerPlayerId;
                $loserId = $defenderPlayerId;
                $battleState['phase'] = 'finished';
                $battleState['winner_id'] = $winnerId;
                unset($battleState['turn_deadline']);
                
                // Award badge & money (unless NPC won)
                $winnerIsNpc = ($winnerId === 'npc_gym_leader');
                if (!$winnerIsNpc) {
                    $stmt = $db->prepare("UPDATE players SET badges = badges + 1, money = money + 2 WHERE id = ?");
                    $stmt->execute([$winnerId]);
                }
                
                // Update bracket
                if ($isRanked && isset($gd['battle_states'])) {
                    $brackets = &$gd['brackets'];
                } else {
                    $brackets = &$gd['brackets'];
                }
                if (isset($brackets)) {
                    foreach ($brackets as &$bracket) {
                        if (($bracket['match_index'] ?? null) === ($battleState['match_index'] ?? $matchIndex)) {
                            $bracket['winner_id'] = $winnerId;
                            $bracket['status'] = 'completed';
                            if (isset($gd['completed_matches'])) {
                                $gd['completed_matches']++;
                            }
                            break;
                        }
                    }
                    unset($bracket);
                }
                
                // Handle tiebreaker elimination
                if (!empty($gd['is_tiebreaker'])) {
                    $gd['eliminated_players'][] = $loserId;
                }
                
                $winnerName = $winnerIsNpc 
                    ? ($battleState['npc_data']['name'] ?? 'Líder') 
                    : (($pw = getPlayerByIdSafe($db, $winnerId)) ? $pw['player_name'] : 'Player');
                $loserIsNpc = ($loserId === 'npc_gym_leader');
                $loserName = $loserIsNpc 
                    ? ($battleState['npc_data']['name'] ?? 'Líder') 
                    : (($pl = getPlayerByIdSafe($db, $loserId)) ? $pl['player_name'] : 'Player');
                
                $npcDialogue = null;
                if ($isNpcBattle && isset($battleState['npc_data'])) {
                    $npcDialogue = $winnerIsNpc 
                        ? $battleState['npc_data']['dialogue_lose'] 
                        : $battleState['npc_data']['dialogue_win'];
                }
                
                broadcastEvent($roomId, $eventPrefix . 'battle_ended', [
                    'match_index' => $matchIndex,
                    'winner_id' => $winnerId,
                    'winner_name' => $winnerName,
                    'loser_id' => $loserId,
                    'loser_name' => $loserName,
                    'is_npc_battle' => $isNpcBattle,
                    'winner_is_npc' => $winnerIsNpc,
                    'npc_dialogue' => $npcDialogue,
                    'auto_enforced' => true
                ]);
                
                // Check if all matches are complete (ranked)
                if ($isRanked && isset($gd['brackets'])) {
                    $allComplete = true;
                    foreach ($gd['brackets'] as $b) {
                        if (($b['status'] ?? '') !== 'completed') { $allComplete = false; break; }
                    }
                    if ($allComplete) {
                        $stmt = $db->prepare("UPDATE rooms SET game_state = 'tournament' WHERE id = ?");
                        $stmt->execute([$roomId]);
                        broadcastEvent($roomId, 'ranked_all_battles_complete', [
                            'brackets' => $gd['brackets'],
                            'auto_enforced' => true
                        ]);
                    }
                } else {
                    // Casual: return to tournament phase
                    $stmt = $db->prepare("UPDATE rooms SET game_state = 'tournament' WHERE id = ?");
                    $stmt->execute([$roomId]);
                }
                
                break; // Battle is over
                
            } else {
                // Defender has pokemon left — needs replacement
                $battleState[$defenderActiveKey] = null;
                
                if ($defenderIsNpc) {
                    // NPC auto-selects next pokemon
                    $availableIndexes = [];
                    foreach ($battleState[$defenderTeamKey] as $idx => $pkmn) {
                        if (!$pkmn['is_fainted']) $availableIndexes[] = $idx;
                    }
                    if (!empty($availableIndexes)) {
                        $npcNext = $availableIndexes[array_rand($availableIndexes)];
                        $battleState['player2_active'] = $npcNext;
                        $newNpcPokemon = $battleState['player2_team'][$npcNext];
                        $battleState['phase'] = 'battle';
                        $battleState['turn_deadline'] = time() + 8;
                        
                        $playerPokemon = $battleState['player1_team'][$battleState['player1_active']];
                        if ($playerPokemon['base_speed'] >= $newNpcPokemon['base_speed']) {
                            $battleState['current_turn'] = 'player1';
                        } else {
                            $battleState['current_turn'] = 'player2';
                        }
                        
                        broadcastEvent($roomId, $isRanked ? 'ranked_pokemon_sent' : 'battle_pokemon_sent', [
                            'match_index' => $matchIndex,
                            'player_id' => 'npc_gym_leader',
                            'player_name' => $battleState['npc_data']['name'] ?? 'Líder',
                            'pokemon_name' => $newNpcPokemon['name'],
                            'pokemon_sprite' => $newNpcPokemon['sprite_url'],
                            'is_player1' => false,
                            'team_index' => $npcNext,
                            'first_turn' => $battleState['current_turn'],
                            'is_npc' => true,
                            'auto_enforced' => true
                        ]);
                        // Continue loop to process next turn if deadline already expired
                        continue;
                    }
                } else {
                    // Human player needs to select replacement — enter selection phase with deadline
                    $battleState['phase'] = 'selection';
                    $battleState['selection_deadline'] = time() + 10;
                    $battleState['waiting_for'] = $isPlayer1Turn ? 'player2' : 'player1';
                    unset($battleState['turn_deadline']);
                    
                    broadcastEvent($roomId, $isRanked ? 'ranked_pokemon_fainted' : 'battle_pokemon_fainted', [
                        'match_index' => $matchIndex,
                        'fainted_pokemon' => $defender['name'],
                        'player_id' => $defenderPlayerId,
                        'player_name' => $defenderName,
                        'needs_selection' => true,
                        'selection_deadline' => $battleState['selection_deadline'],
                        'is_npc' => false,
                        'auto_enforced' => true
                    ]);
                }
                break; // Wait for selection (deadline enforcement will handle if they don't select)
            }
        } else {
            // No faint — switch turns
            $battleState['current_turn'] = $isPlayer1Turn ? 'player2' : 'player1';
            $battleState['turn_number'] = ($battleState['turn_number'] ?? 0) + 1;
            $battleState['turn_deadline'] = time() + 8;
            // Continue loop to auto-execute next turn if that deadline is also expired
            // (This won't happen on the first enforcement since we just set deadline to now+8,
            //  but guards against very long enforcement delays)
        }
    }
    
    return $didAction;
}

/**
 * Safe player lookup (doesn't crash if player doesn't exist).
 */
function getPlayerByIdSafe($db, $playerId) {
    if (!$playerId || $playerId === 'npc_gym_leader') return null;
    $stmt = $db->prepare("SELECT * FROM players WHERE id = ?");
    $stmt->execute([$playerId]);
    return $stmt->fetch();
}

/**
 * In ranked mode, generate brackets when tournament state has no game_data.
 * This handles the case where town->tournament transition set game_data = NULL.
 */
function enforceRankedGenerateBrackets($db, $roomId) {
    $db->beginTransaction();
    try {
        $stmt = $db->prepare("SELECT game_state, game_data, game_mode, current_route FROM rooms WHERE id = ? FOR UPDATE");
        $stmt->execute([$roomId]);
        $room = $stmt->fetch();
        
        if (!$room || $room['game_state'] !== 'tournament' || ($room['game_mode'] ?? 'casual') !== 'ranked') {
            $db->commit();
            return false;
        }
        
        $gd = $room['game_data'] ? json_decode($room['game_data'], true) : [];
        if (isset($gd['brackets'])) {
            $db->commit();
            return false; // Already has brackets
        }
        
        // Load tournament.php functions
        require_once __DIR__ . '/tournament.php';
        
        $currentRoute = $room['current_route'] ?? 1;
        
        // Get players
        $stmt = $db->prepare("
            SELECT p.*, 
                   (SELECT COUNT(*) FROM player_pokemon WHERE player_id = p.id) as pokemon_count
            FROM players p 
            WHERE p.room_id = ? 
            ORDER BY p.badges DESC, p.player_number ASC
        ");
        $stmt->execute([$roomId]);
        $players = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        if (count($players) < 2) {
            $db->commit();
            return false;
        }
        
        // Generate brackets using tournament.php function
        // (generateBrackets writes to game_data internally, but we call it here)
        $tournamentData = generateBrackets($db, $roomId, $players, $currentRoute);
        
        // Set a start_deadline so auto-start fires after 5 seconds
        $tournamentData['start_deadline'] = time() + 5;
        $stmt = $db->prepare("UPDATE rooms SET game_data = ? WHERE id = ?");
        $stmt->execute([json_encode($tournamentData), $roomId]);
        
        $db->commit();
        
        broadcastEvent($roomId, 'tournament_brackets_generated', [
            'brackets' => $tournamentData['brackets'],
            'total_matches' => $tournamentData['total_matches'],
            'auto_enforced' => true
        ]);
        
        return true;
    } catch (\Exception $e) {
        $db->rollBack();
        error_log("enforceRankedGenerateBrackets error: " . $e->getMessage());
        return false;
    }
}

/**
 * In ranked mode, auto-start all pending battles after a delay.
 * This replaces the client-side host-only countdown mechanism.
 * Sets a start_deadline on first call, then starts battles when deadline passes.
 */
function enforceRankedAutoStartBattles($db, $roomId, $room, $gd) {
    // Check if we have a start_deadline set
    $startDeadline = $gd['start_deadline'] ?? null;
    
    if (!$startDeadline) {
        // First call: set the deadline (12 seconds, matching client countdown + buffer)
        $db->beginTransaction();
        try {
            $stmt = $db->prepare("SELECT game_state, game_data FROM rooms WHERE id = ? FOR UPDATE");
            $stmt->execute([$roomId]);
            $lockedRoom = $stmt->fetch();
            
            if (!$lockedRoom || $lockedRoom['game_state'] !== 'tournament') {
                $db->commit();
                return false;
            }
            
            $lockedGd = $lockedRoom['game_data'] ? json_decode($lockedRoom['game_data'], true) : [];
            if (!empty($lockedGd['all_battles_started']) || !empty($lockedGd['start_deadline'])) {
                $db->commit();
                return false;
            }
            
            $lockedGd['start_deadline'] = time() + 5;
            $stmt = $db->prepare("UPDATE rooms SET game_data = ? WHERE id = ?");
            $stmt->execute([json_encode($lockedGd), $roomId]);
            $db->commit();
            return true; // We set the deadline, will start on next enforcement tick
        } catch (\Exception $e) {
            $db->rollBack();
            error_log("enforceRankedAutoStartBattles set deadline error: " . $e->getMessage());
            return false;
        }
    }
    
    // Deadline exists — check if it has passed
    if (time() <= $startDeadline) {
        return false; // Not yet
    }
    
    // Time to auto-start all battles!
    $db->beginTransaction();
    try {
        $stmt = $db->prepare("SELECT game_state, game_data, current_route FROM rooms WHERE id = ? FOR UPDATE");
        $stmt->execute([$roomId]);
        $lockedRoom = $stmt->fetch();
        
        if (!$lockedRoom || $lockedRoom['game_state'] !== 'tournament') {
            $db->commit();
            return false;
        }
        
        $tournamentData = $lockedRoom['game_data'] ? json_decode($lockedRoom['game_data'], true) : [];
        
        if (empty($tournamentData['brackets']) || !empty($tournamentData['all_battles_started'])) {
            $db->commit();
            return false;
        }
        
        $currentRoute = $tournamentData['current_route'] ?? $lockedRoom['current_route'] ?? 1;
        $battleStates = [];
        
        // Initialize battle state for every pending match
        foreach ($tournamentData['brackets'] as &$bracket) {
            if ($bracket['status'] !== 'pending') continue;
            
            $bracket['status'] = 'in_progress';
            $matchIndex = $bracket['match_index'];
            $player1Id = $bracket['player1_id'];
            $player2Id = $bracket['player2_id'];
            $isNpcBattle = !empty($bracket['is_npc_battle']);
            
            // Get player 1 team
            $stmtTeam = $db->prepare("
                SELECT pp.id as team_id, pp.pokemon_id, pp.current_hp, pp.current_exp, 
                       pp.is_active, pp.team_position,
                       pp.bonus_hp, pp.bonus_attack, pp.bonus_speed,
                       pd.name, pd.type_defense, pd.type_attack, pd.base_hp, 
                       pd.base_attack, pd.base_speed, pd.evolution_id, pd.evolution_number,
                       pd.sprite_url
                FROM player_pokemon pp
                JOIN pokemon_dex pd ON pp.pokemon_id = pd.id
                WHERE pp.player_id = ?
                ORDER BY pp.team_position ASC
            ");
            $stmtTeam->execute([$player1Id]);
            $player1Team = $stmtTeam->fetchAll(PDO::FETCH_ASSOC);
            
            if ($isNpcBattle) {
                // Load tournament.php functions if needed
                if (!function_exists('createGymLeaderBattleState')) {
                    require_once __DIR__ . '/tournament.php';
                }
                $bs = createGymLeaderBattleState($db, $player1Id, $player1Team, $currentRoute);
                $bs['match_index'] = $matchIndex;
                $npcSelectedIndex = npcSelectPokemon($bs);
                if ($npcSelectedIndex !== null) {
                    $bs['player2_active'] = $npcSelectedIndex;
                }
            } else {
                $stmtTeam->execute([$player2Id]);
                $player2Team = $stmtTeam->fetchAll(PDO::FETCH_ASSOC);
                
                $bs = [
                    'match_index' => $matchIndex,
                    'player1_id' => $player1Id,
                    'player2_id' => $player2Id,
                    'is_npc_battle' => false,
                    'player1_team' => array_map(function($p) {
                        $bonusHp = (int)($p['bonus_hp'] ?? 0);
                        $bonusAtk = (int)($p['bonus_attack'] ?? 0);
                        $bonusSpd = (int)($p['bonus_speed'] ?? 0);
                        $battleHp = ceil($p['base_hp'] / 10 * 3) + $bonusHp;
                        return [
                            'team_id' => $p['team_id'], 'pokemon_id' => $p['pokemon_id'],
                            'name' => $p['name'], 'type_defense' => $p['type_defense'],
                            'type_attack' => $p['type_attack'], 'base_hp' => $p['base_hp'],
                            'base_attack' => $p['base_attack'] + $bonusAtk,
                            'base_speed' => $p['base_speed'] + $bonusSpd,
                            'battle_hp' => $battleHp, 'current_hp' => $battleHp,
                            'sprite_url' => $p['sprite_url'], 'is_fainted' => false,
                            'bonus_hp' => $bonusHp, 'bonus_attack' => $bonusAtk, 'bonus_speed' => $bonusSpd
                        ];
                    }, $player1Team),
                    'player2_team' => array_map(function($p) {
                        $bonusHp = (int)($p['bonus_hp'] ?? 0);
                        $bonusAtk = (int)($p['bonus_attack'] ?? 0);
                        $bonusSpd = (int)($p['bonus_speed'] ?? 0);
                        $battleHp = ceil($p['base_hp'] / 10 * 3) + $bonusHp;
                        return [
                            'team_id' => $p['team_id'], 'pokemon_id' => $p['pokemon_id'],
                            'name' => $p['name'], 'type_defense' => $p['type_defense'],
                            'type_attack' => $p['type_attack'], 'base_hp' => $p['base_hp'],
                            'base_attack' => $p['base_attack'] + $bonusAtk,
                            'base_speed' => $p['base_speed'] + $bonusSpd,
                            'battle_hp' => $battleHp, 'current_hp' => $battleHp,
                            'sprite_url' => $p['sprite_url'], 'is_fainted' => false,
                            'bonus_hp' => $bonusHp, 'bonus_attack' => $bonusAtk, 'bonus_speed' => $bonusSpd
                        ];
                    }, $player2Team),
                    'player1_active' => null,
                    'player2_active' => null,
                    'current_turn' => null,
                    'phase' => 'selection',
                    'selection_deadline' => time() + 10,
                    'turn_number' => 0,
                    'battle_log' => []
                ];
            }
            
            $battleStates[$matchIndex] = $bs;
        }
        unset($bracket);
        
        $tournamentData['all_battles_started'] = true;
        $tournamentData['battle_states'] = $battleStates;
        unset($tournamentData['start_deadline']);
        
        $stmt = $db->prepare("UPDATE rooms SET game_state = 'battle', game_data = ? WHERE id = ?");
        $stmt->execute([json_encode($tournamentData), $roomId]);
        
        $db->commit();
        
        // Build broadcast data
        $matchesInfo = [];
        foreach ($tournamentData['brackets'] as $bracket) {
            if ($bracket['status'] !== 'in_progress') continue;
            $p1 = getPlayerByIdSafe($db, $bracket['player1_id']);
            $isNpc = !empty($bracket['is_npc_battle']);
            $matchInfo = [
                'match_index' => $bracket['match_index'],
                'is_npc_battle' => $isNpc,
                'player1' => ['id' => $bracket['player1_id'], 'name' => $p1 ? $p1['player_name'] : 'Player'],
            ];
            if ($isNpc) {
                if (!function_exists('getGymLeaderData')) {
                    require_once __DIR__ . '/tournament.php';
                }
                $gymLeader = getGymLeaderData($currentRoute);
                $matchInfo['player2'] = [
                    'id' => 'npc_gym_leader', 'name' => $gymLeader['name'],
                    'title' => $gymLeader['title'], 'avatar' => $gymLeader['avatar'], 'is_npc' => true
                ];
            } else {
                $p2 = getPlayerByIdSafe($db, $bracket['player2_id']);
                $matchInfo['player2'] = ['id' => $bracket['player2_id'], 'name' => $p2 ? $p2['player_name'] : 'Player'];
            }
            $matchesInfo[] = $matchInfo;
        }
        
        broadcastEvent($roomId, 'all_battles_started', [
            'matches' => $matchesInfo,
            'game_mode' => 'ranked',
            'auto_enforced' => true
        ]);
        
        error_log("enforceRankedAutoStartBattles: Auto-started all battles for room $roomId");
        return true;
        
    } catch (\Exception $e) {
        $db->rollBack();
        error_log("enforceRankedAutoStartBattles error: " . $e->getMessage());
        return false;
    }
}

/**
 * In ranked mode, if all tournament matches are complete and we're still in
 * tournament phase, auto-advance to the next route (or finish the game).
 */
function enforceRankedTournamentComplete($db, $roomId, $room, $gd) {
    // Check if all brackets are completed
    if (!isset($gd['brackets'])) return false;
    
    $allComplete = true;
    foreach ($gd['brackets'] as $b) {
        if (($b['status'] ?? '') !== 'completed') {
            $allComplete = false;
            break;
        }
    }
    
    if (!$allComplete) return false;
    
    // Add a small delay buffer (5 seconds) after last match completes
    // to let the UI show results before auto-advancing
    $lastCompletedTime = $gd['last_match_completed_at'] ?? null;
    if (!$lastCompletedTime) {
        // Set the timestamp now; next tick will check the delay
        $gd['last_match_completed_at'] = time();
        $stmt = $db->prepare("UPDATE rooms SET game_data = ? WHERE id = ?");
        $stmt->execute([json_encode($gd), $roomId]);
        return false;
    }
    
    if (time() - $lastCompletedTime < 5) {
        return false; // Wait for the delay
    }
    
    // Auto-advance: use the same logic as ranked_complete_tournament
    // We need to lock the row to prevent race with client-triggered advance
    $db->beginTransaction();
    try {
        $stmt = $db->prepare("SELECT game_state, game_mode, current_route FROM rooms WHERE id = ? FOR UPDATE");
        $stmt->execute([$roomId]);
        $lockedRoom = $stmt->fetch();
        
        if (!$lockedRoom || $lockedRoom['game_state'] !== 'tournament') {
            $db->commit();
            return false; // Already advanced
        }
        
        $currentRoute = $lockedRoom['current_route'];
        $maxRoutes = RANKED_TOTAL_ROUTES;
        $badgesToWin = RANKED_BADGES_TO_WIN;
        
        // Get players
        $stmt = $db->prepare("SELECT * FROM players WHERE room_id = ? ORDER BY badges DESC, player_number ASC");
        $stmt->execute([$roomId]);
        $players = $stmt->fetchAll();
        
        // Check for badge winners
        $playersWithWinningBadges = array_filter($players, function($p) use ($badgesToWin) {
            return $p['badges'] >= $badgesToWin;
        });
        $playersWithWinningBadges = array_values($playersWithWinningBadges);
        
        $isLastRoute = ($currentRoute >= $maxRoutes);
        
        if (count($playersWithWinningBadges) === 1) {
            $winner = $playersWithWinningBadges[0];
            $stmt = $db->prepare("UPDATE rooms SET game_state = 'finished', game_data = ? WHERE id = ?");
            $stmt->execute([json_encode(['winner_id' => $winner['id'], 'winner_name' => $winner['player_name'], 'win_type' => 'badges']), $roomId]);
            broadcastEvent($roomId, 'game_finished', [
                'winner_id' => $winner['id'], 'winner_name' => $winner['player_name'],
                'win_type' => 'badges', 'badges' => $winner['badges']
            ]);
            $db->commit();
            return true;
        } elseif (count($playersWithWinningBadges) > 1) {
            // Tiebreaker needed — let the client handle this via ranked_complete_tournament
            $db->commit();
            return false;
        } elseif ($isLastRoute) {
            // Last route — find winner by most badges or tiebreaker
            $maxBadges = $players[0]['badges'];
            $playersWithMaxBadges = array_values(array_filter($players, function($p) use ($maxBadges) {
                return $p['badges'] == $maxBadges;
            }));
            
            if (count($playersWithMaxBadges) === 1) {
                $winner = $playersWithMaxBadges[0];
                $stmt = $db->prepare("UPDATE rooms SET game_state = 'finished', game_data = ? WHERE id = ?");
                $stmt->execute([json_encode(['winner_id' => $winner['id'], 'winner_name' => $winner['player_name'], 'win_type' => 'most_badges']), $roomId]);
                broadcastEvent($roomId, 'game_finished', [
                    'winner_id' => $winner['id'], 'winner_name' => $winner['player_name'],
                    'win_type' => 'most_badges', 'badges' => $winner['badges']
                ]);
                $db->commit();
                return true;
            } else {
                // Tiebreaker — let client handle
                $db->commit();
                return false;
            }
        }
        
        // Advance to next route
        $newRoute = $currentRoute + 1;
        $playerCount = count($players);
        $randomFirstPlayer = rand(0, $playerCount - 1);
        $firstPlayer = null;
        foreach ($players as $p) {
            if ($p['player_number'] == $randomFirstPlayer) { $firstPlayer = $p; break; }
        }
        
        $stmt = $db->prepare("UPDATE players SET is_ready = FALSE, turns_taken = 0 WHERE room_id = ?");
        $stmt->execute([$roomId]);
        $stmt = $db->prepare("DELETE FROM wild_pokemon WHERE room_id = ?");
        $stmt->execute([$roomId]);
        $stmt = $db->prepare("UPDATE players SET money = money + 3 WHERE room_id = ?");
        $stmt->execute([$roomId]);
        
        $stmt = $db->prepare("UPDATE rooms SET game_state = 'catching', current_route = ?, encounters_remaining = 0, current_player_turn = ?, game_data = NULL WHERE id = ?");
        $stmt->execute([$newRoute, $randomFirstPlayer, $roomId]);
        
        broadcastEvent($roomId, 'phase_changed', [
            'new_phase' => 'catching', 'new_route' => $newRoute,
            'first_player' => $randomFirstPlayer,
            'first_player_name' => $firstPlayer ? $firstPlayer['player_name'] : 'Unknown'
        ]);
        
        $db->commit();
        return true;
        
    } catch (\Exception $e) {
        $db->rollBack();
        error_log("enforceRankedTournamentComplete error: " . $e->getMessage());
        return false;
    }
}
