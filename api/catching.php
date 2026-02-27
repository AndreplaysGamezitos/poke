<?php
/**
 * PokeFodase - Catching Phase API
 * Handles wild Pokemon encounters, catching, and attacking
 */

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/broadcast.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

try {
    $action = $_GET['action'] ?? $_POST['action'] ?? '';

    switch ($action) {
        case 'get_state':
            getCatchingState();
            break;
        case 'spawn_wild':
            spawnWildPokemon();
            break;
        case 'catch':
            attemptCatch();
            break;
        case 'attack':
            attackWild();
            break;
        case 'get_route':
            getRouteInfo();
            break;
        case 'set_active':
            setActivePokemon();
            break;
        default:
            jsonResponse(['error' => 'Invalid action'], 400);
    }
} catch (Exception $e) {
    jsonResponse(['error' => 'Server error: ' . $e->getMessage()], 500);
}

/**
 * Get current catching phase state
 */
function getCatchingState() {
    $db = getDB();
    
    $roomCode = $_GET['room_code'] ?? '';
    $roomId = $_SESSION['room_id'] ?? null;
    
    if (!$roomId && empty($roomCode)) {
        jsonResponse(['error' => 'Room not specified'], 400);
    }
    
    // Get room by code if needed
    if (!$roomId) {
        $stmt = $db->prepare("SELECT id FROM rooms WHERE room_code = ?");
        $stmt->execute([$roomCode]);
        $room = $stmt->fetch();
        if (!$room) {
            jsonResponse(['error' => 'Room not found'], 404);
        }
        $roomId = $room['id'];
    }
    
    // Get room state
    $stmt = $db->prepare("
        SELECT r.*, rt.route_name, rt.background_url
        FROM rooms r
        LEFT JOIN routes rt ON r.current_route = rt.route_number
        WHERE r.id = ?
    ");
    $stmt->execute([$roomId]);
    $room = $stmt->fetch();
    
    // --- SERVER-SIDE DEADLINE ENFORCEMENT ---
    // If the turn deadline has passed and it's still the catching phase,
    // auto-catch (regular ball) for the current player and advance the turn.
    if ($room['game_state'] === 'catching' && $room['game_data']) {
        $gd = json_decode($room['game_data'], true);
        $turnDeadline = $gd['turn_deadline'] ?? null;
        
        if ($turnDeadline && time() > $turnDeadline) {
            $enforced = enforceCatchingDeadline($db, $roomId);
            if ($enforced) {
                // Re-fetch room state — phase or turn may have changed
                $stmt = $db->prepare("
                    SELECT r.*, rt.route_name, rt.background_url
                    FROM rooms r
                    LEFT JOIN routes rt ON r.current_route = rt.route_number
                    WHERE r.id = ?
                ");
                $stmt->execute([$roomId]);
                $room = $stmt->fetch();
                
                // If phase changed away from catching, return early with updated state
                if ($room['game_state'] !== 'catching') {
                    jsonResponse([
                        'success' => true,
                        'room' => [
                            'game_state' => $room['game_state'],
                            'current_route' => $room['current_route'],
                            'route_name' => $room['route_name'] ?? null,
                            'current_player_turn' => $room['current_player_turn'],
                            'turns_per_player' => TURNS_PER_PLAYER,
                            'current_cycle' => TURNS_PER_PLAYER,
                            'all_turns_done' => true,
                            'encounters_remaining' => 0,
                            'turn_deadline' => null
                        ],
                        'wild_pokemon' => null,
                        'players' => [],
                        'current_player_id' => $_SESSION['player_id'] ?? null
                    ]);
                }
            }
        }
    }
    
    // Get current wild Pokemon
    $stmt = $db->prepare("
        SELECT wp.*, pd.name, pd.type_defense, pd.type_attack, 
               pd.base_hp, pd.base_attack, pd.base_speed, pd.sprite_url,
               pd.catch_rate as base_catch_rate
        FROM wild_pokemon wp
        JOIN pokemon_dex pd ON wp.pokemon_id = pd.id
        WHERE wp.room_id = ? AND wp.is_active = TRUE
        LIMIT 1
    ");
    $stmt->execute([$roomId]);
    $wildPokemon = $stmt->fetch();
    
    // Auto-spawn wild Pokemon if we're in catching phase and the route isn't done
    if (!$wildPokemon && $room['game_state'] === 'catching') {
        // Check if any player still has turns remaining
        $stmtTurns = $db->prepare("SELECT MIN(turns_taken) as min_turns FROM players WHERE room_id = ?");
        $stmtTurns->execute([$roomId]);
        $minTurns = $stmtTurns->fetch()['min_turns'] ?? 0;
        if ($minTurns < TURNS_PER_PLAYER) {
            spawnWildPokemonForRoom($db, $roomId);
            // Re-fetch the wild Pokemon
            $stmt->execute([$roomId]);
            $wildPokemon = $stmt->fetch();
        }
    }
    
    // Calculate effective catch rate if there's a wild Pokemon
    if ($wildPokemon) {
        $baseCatchRate = $wildPokemon['base_catch_rate'] ?? 30;
        $hpRatio = $wildPokemon['max_hp'] > 0 
            ? $wildPokemon['current_hp'] / $wildPokemon['max_hp'] 
            : 1;
        $hpBonus = round((1 - $hpRatio) * 40);
        $wildPokemon['catch_rate'] = min(95, $baseCatchRate + $hpBonus);
        $wildPokemon['hp_bonus'] = $hpBonus;
    }
    
    // Get all players with their teams
    $stmt = $db->prepare("
        SELECT p.id, p.player_number, p.player_name, p.avatar_id, 
               p.money, p.ultra_balls, p.badges, p.turns_taken
        FROM players p
        WHERE p.room_id = ?
        ORDER BY p.player_number
    ");
    $stmt->execute([$roomId]);
    $players = $stmt->fetchAll();
    
    // Get each player's active Pokemon and full team
    foreach ($players as &$player) {
        $stmt = $db->prepare("
            SELECT pp.*, pd.name, pd.type_defense, pd.type_attack,
                   pd.base_hp, pd.base_attack, pd.base_speed, pd.sprite_url
            FROM player_pokemon pp
            JOIN pokemon_dex pd ON pp.pokemon_id = pd.id
            WHERE pp.player_id = ? AND pp.is_active = TRUE
            LIMIT 1
        ");
        $stmt->execute([$player['id']]);
        $player['active_pokemon'] = $stmt->fetch();
        
        // Get full team
        $stmt = $db->prepare("
            SELECT pp.*, pd.name, pd.type_defense, pd.type_attack,
                   pd.base_hp, pd.base_attack, pd.base_speed, pd.sprite_url, pd.evolution_id
            FROM player_pokemon pp
            JOIN pokemon_dex pd ON pp.pokemon_id = pd.id
            WHERE pp.player_id = ?
            ORDER BY pp.team_position
        ");
        $stmt->execute([$player['id']]);
        $player['team'] = $stmt->fetchAll();
        
        // Get team count
        $player['team_count'] = count($player['team']);
    }
    
    // Calculate current cycle: the minimum turns_taken across all players + 1
    $minTurns = PHP_INT_MAX;
    $allDone = true;
    foreach ($players as $p) {
        $t = $p['turns_taken'] ?? 0;
        if ($t < $minTurns) $minTurns = $t;
        if ($t < TURNS_PER_PLAYER) $allDone = false;
    }
    if ($minTurns === PHP_INT_MAX) $minTurns = 0;
    $currentCycle = $minTurns + 1;
    
    // Extract turn_deadline from game_data
    $turnDeadline = null;
    if ($room['game_data']) {
        $gd = json_decode($room['game_data'], true);
        $turnDeadline = $gd['turn_deadline'] ?? null;
    }
    
    jsonResponse([
        'success' => true,
        'room' => [
            'game_state' => $room['game_state'],
            'current_route' => $room['current_route'],
            'route_name' => $room['route_name'],
            'current_player_turn' => $room['current_player_turn'],
            'turns_per_player' => TURNS_PER_PLAYER,
            'current_cycle' => min($currentCycle, TURNS_PER_PLAYER),
            'all_turns_done' => $allDone,
            // Keep encounters_remaining for backward compat (informational only)
            'encounters_remaining' => $room['encounters_remaining'],
            'turn_deadline' => $turnDeadline
        ],
        'wild_pokemon' => $wildPokemon,
        'players' => $players,
        'current_player_id' => $_SESSION['player_id'] ?? null
    ]);
}

/**
 * Spawn a new wild Pokemon for the current route
 */
function spawnWildPokemon() {
    $db = getDB();
    
    $roomId = $_SESSION['room_id'] ?? null;
    if (!$roomId) {
        jsonResponse(['error' => 'Not in a room'], 400);
    }
    
    // Get room state
    $stmt = $db->prepare("SELECT * FROM rooms WHERE id = ?");
    $stmt->execute([$roomId]);
    $room = $stmt->fetch();
    
    if ($room['game_state'] !== 'catching') {
        jsonResponse(['error' => 'Not in catching phase'], 400);
    }
    
    // Check if there's already an active wild Pokemon
    $stmt = $db->prepare("SELECT id FROM wild_pokemon WHERE room_id = ? AND is_active = TRUE");
    $stmt->execute([$roomId]);
    if ($stmt->fetch()) {
        jsonResponse(['error' => 'Wild Pokemon already active'], 400);
    }
    
    // Get route ID
    $stmt = $db->prepare("SELECT id FROM routes WHERE route_number = ?");
    $stmt->execute([$room['current_route']]);
    $route = $stmt->fetch();
    
    if (!$route) {
        jsonResponse(['error' => 'Route not found'], 404);
    }
    
    // Get Pokemon already caught this phase (to avoid duplicates)
    $stmt = $db->prepare("
        SELECT DISTINCT pokemon_id FROM wild_pokemon WHERE room_id = ?
    ");
    $stmt->execute([$roomId]);
    $caughtIds = $stmt->fetchAll(PDO::FETCH_COLUMN);
    
    // Get random Pokemon from route (excluding already spawned this phase)
    $placeholders = count($caughtIds) > 0 ? implode(',', array_fill(0, count($caughtIds), '?')) : '0';
    $params = array_merge([$route['id']], $caughtIds);
    
    $stmt = $db->prepare("
        SELECT pd.* FROM route_pokemon rp
        JOIN pokemon_dex pd ON rp.pokemon_id = pd.id
        WHERE rp.route_id = ? AND pd.id NOT IN ($placeholders)
        ORDER BY RAND()
        LIMIT 1
    ");
    $stmt->execute($params);
    $pokemon = $stmt->fetch();
    
    if (!$pokemon) {
        // All Pokemon from this route have been encountered, get any random one
        $stmt = $db->prepare("
            SELECT pd.* FROM route_pokemon rp
            JOIN pokemon_dex pd ON rp.pokemon_id = pd.id
            WHERE rp.route_id = ?
            ORDER BY RAND()
            LIMIT 1
        ");
        $stmt->execute([$route['id']]);
        $pokemon = $stmt->fetch();
    }
    
    if (!$pokemon) {
        jsonResponse(['error' => 'No Pokemon available on this route'], 404);
    }
    
    // Calculate wild Pokemon HP: (base_hp / 10) * 3
    $wildHp = ceil(($pokemon['base_hp'] / 10) * 3);
    
    // Spawn the wild Pokemon
    $stmt = $db->prepare("
        INSERT INTO wild_pokemon (room_id, pokemon_id, current_hp, max_hp, is_active)
        VALUES (?, ?, ?, ?, TRUE)
    ");
    $stmt->execute([$roomId, $pokemon['id'], $wildHp, $wildHp]);
    
    // Set turn deadline now that a wild Pokemon is available
    $turnDeadline = time() + 5;
    $turnGameData = json_encode(['turn_deadline' => $turnDeadline]);
    $stmtGD = $db->prepare("UPDATE rooms SET game_data = ? WHERE id = ?");
    $stmtGD->execute([$turnGameData, $roomId]);
    
    // Add game event
    addGameEvent($roomId, 'wild_pokemon_appeared', [
        'pokemon_id' => $pokemon['id'],
        'pokemon_name' => $pokemon['name'],
        'sprite_url' => $pokemon['sprite_url'],
        'hp' => $wildHp,
        'max_hp' => $wildHp,
        'turn_deadline' => $turnDeadline
    ]);
    
    jsonResponse([
        'success' => true,
        'pokemon' => array_merge($pokemon, [
            'current_hp' => $wildHp,
            'max_hp' => $wildHp
        ])
    ]);
}

/**
 * Attempt to catch the wild Pokemon
 */
function attemptCatch() {
    $db = getDB();
    
    $playerId = $_SESSION['player_id'] ?? null;
    $roomId = $_SESSION['room_id'] ?? null;
    
    if (!$playerId || !$roomId) {
        jsonResponse(['error' => 'Not in a room'], 400);
    }
    
    $useUltraBall = isset($_POST['use_ultra_ball']) && $_POST['use_ultra_ball'] === 'true';
    
    // Get room state
    $stmt = $db->prepare("SELECT * FROM rooms WHERE id = ?");
    $stmt->execute([$roomId]);
    $room = $stmt->fetch();
    
    if ($room['game_state'] !== 'catching') {
        jsonResponse(['error' => 'Not in catching phase'], 400);
    }
    
    // Get player info
    $stmt = $db->prepare("SELECT * FROM players WHERE id = ?");
    $stmt->execute([$playerId]);
    $player = $stmt->fetch();
    
    // Check if it's this player's turn
    if ($player['player_number'] != $room['current_player_turn']) {
        jsonResponse(['error' => 'Not your turn'], 400);
    }
    
    // Get wild Pokemon
    $stmt = $db->prepare("
        SELECT wp.*, pd.name, pd.base_hp, pd.sprite_url
        FROM wild_pokemon wp
        JOIN pokemon_dex pd ON wp.pokemon_id = pd.id
        WHERE wp.room_id = ? AND wp.is_active = TRUE
    ");
    $stmt->execute([$roomId]);
    $wildPokemon = $stmt->fetch();
    
    if (!$wildPokemon) {
        jsonResponse(['error' => 'No wild Pokemon to catch'], 400);
    }
    
    // Check ultra ball usage
    if ($useUltraBall && $player['ultra_balls'] <= 0) {
        jsonResponse(['error' => 'No Ultra Balls available'], 400);
    }
    
    // Get catch rate from pokemon_dex (base rate 15-40%, increases with damage taken)
    $stmt = $db->prepare("SELECT catch_rate FROM pokemon_dex WHERE id = ?");
    $stmt->execute([$wildPokemon['pokemon_id']]);
    $pokemonData = $stmt->fetch();
    $baseCatchRate = $pokemonData['catch_rate'] ?? 30;
    
    // Calculate effective catch rate: base rate + HP damage bonus
    // At full HP: effective = base rate
    // As HP drops: effective increases by up to +40%
    // Formula: effective = base + (1 - current_hp/max_hp) × 40
    $hpRatio = $wildPokemon['max_hp'] > 0 
        ? $wildPokemon['current_hp'] / $wildPokemon['max_hp'] 
        : 1;
    $hpBonus = round((1 - $hpRatio) * 40);
    $catchRate = min(95, $baseCatchRate + $hpBonus); // Cap at 95%
    
    // Determine catch success: random(0,99) < effective catch rate
    $catchRoll = rand(0, 99);
    $caught = $useUltraBall || ($catchRoll < $catchRate);
    
    // Use ultra ball if requested
    if ($useUltraBall) {
        $stmt = $db->prepare("UPDATE players SET ultra_balls = ultra_balls - 1 WHERE id = ?");
        $stmt->execute([$playerId]);
    }
    
    $result = [
        'catch_roll' => $catchRoll,
        'catch_rate' => $catchRate,
        'base_catch_rate' => $baseCatchRate,
        'hp_bonus' => $hpBonus,
        'used_ultra_ball' => $useUltraBall,
        'caught' => $caught
    ];
    
    if ($caught) {
        // Check team size
        $stmt = $db->prepare("SELECT COUNT(*) as count FROM player_pokemon WHERE player_id = ?");
        $stmt->execute([$playerId]);
        $teamCount = $stmt->fetch()['count'];
        
        if ($teamCount >= 6) {
            // Team is full, give money instead
            $stmt = $db->prepare("UPDATE players SET money = money + 2 WHERE id = ?");
            $stmt->execute([$playerId]);
            $result['team_full'] = true;
            $result['money_gained'] = 2;
        } else {
            // Add Pokemon to team
            $stmt = $db->prepare("
                INSERT INTO player_pokemon (player_id, pokemon_id, current_hp, current_exp, is_active, team_position)
                VALUES (?, ?, ?, 0, FALSE, ?)
            ");
            $stmt->execute([$playerId, $wildPokemon['pokemon_id'], $wildPokemon['base_hp'], $teamCount]);
            $result['team_full'] = false;
        }
        
        // Mark wild Pokemon as caught
        $stmt = $db->prepare("UPDATE wild_pokemon SET is_active = FALSE WHERE id = ?");
        $stmt->execute([$wildPokemon['id']]);
    }
    
    // Check if this catch will complete the route (all players done after this turn)
    $isLastTurn = false;
    if ($caught) {
        // Check if, after incrementing this player's turns_taken, all players are done
        $stmt = $db->prepare("SELECT player_number, turns_taken FROM players WHERE room_id = ?");
        $stmt->execute([$roomId]);
        $allPlayers = $stmt->fetchAll();
        $allDoneAfter = true;
        foreach ($allPlayers as $p) {
            $turnsAfter = $p['turns_taken'];
            if ($p['player_number'] == $player['player_number']) {
                $turnsAfter += 1; // This turn hasn't been counted yet
            }
            if ($turnsAfter < TURNS_PER_PLAYER) {
                $allDoneAfter = false;
                break;
            }
        }
        $isLastTurn = $allDoneAfter;
    }
    $result['is_last_pokemon'] = $isLastTurn;
    
    // Advance turn - encounter ends only if Pokemon was caught
    advanceTurn($db, $roomId, $room, $caught);
    
    // Add game event
    addGameEvent($roomId, 'catch_attempt', [
        'player_id' => $playerId,
        'player_name' => $player['player_name'],
        'pokemon_name' => $wildPokemon['name'],
        'catch_roll' => $catchRoll,
        'dice_roll' => $catchRoll,  // Alias for frontend compatibility
        'catch_rate' => $catchRate,
        'used_ultra_ball' => $useUltraBall,
        'caught' => $caught,
        'team_full' => $result['team_full'] ?? false,
        'is_last_pokemon' => $isLastTurn
    ]);
    
    jsonResponse([
        'success' => true,
        'result' => $result,
        'pokemon_name' => $wildPokemon['name']
    ]);
}

/**
 * Attack the wild Pokemon
 */
function attackWild() {
    $db = getDB();
    
    $playerId = $_SESSION['player_id'] ?? null;
    $roomId = $_SESSION['room_id'] ?? null;
    
    if (!$playerId || !$roomId) {
        jsonResponse(['error' => 'Not in a room'], 400);
    }
    
    // Get room state
    $stmt = $db->prepare("SELECT * FROM rooms WHERE id = ?");
    $stmt->execute([$roomId]);
    $room = $stmt->fetch();
    
    if ($room['game_state'] !== 'catching') {
        jsonResponse(['error' => 'Not in catching phase'], 400);
    }
    
    // Get player info
    $stmt = $db->prepare("SELECT * FROM players WHERE id = ?");
    $stmt->execute([$playerId]);
    $player = $stmt->fetch();
    
    // Check if it's this player's turn
    if ($player['player_number'] != $room['current_player_turn']) {
        jsonResponse(['error' => 'Not your turn'], 400);
    }
    
    // Get player's active Pokemon
    $stmt = $db->prepare("
        SELECT pp.*, pd.name as pokemon_name, pd.type_attack, pd.base_attack
        FROM player_pokemon pp
        JOIN pokemon_dex pd ON pp.pokemon_id = pd.id
        WHERE pp.player_id = ? AND pp.is_active = TRUE
    ");
    $stmt->execute([$playerId]);
    $activePokemon = $stmt->fetch();
    
    if (!$activePokemon) {
        jsonResponse(['error' => 'No active Pokemon'], 400);
    }
    
    // Get wild Pokemon
    $stmt = $db->prepare("
        SELECT wp.*, pd.name, pd.type_defense, pd.sprite_url
        FROM wild_pokemon wp
        JOIN pokemon_dex pd ON wp.pokemon_id = pd.id
        WHERE wp.room_id = ? AND wp.is_active = TRUE
    ");
    $stmt->execute([$roomId]);
    $wildPokemon = $stmt->fetch();
    
    if (!$wildPokemon) {
        jsonResponse(['error' => 'No wild Pokemon to attack'], 400);
    }
    
    // Calculate damage
    $typeMultiplier = getTypeEffectiveness($activePokemon['type_attack'], $wildPokemon['type_defense']);
    $damage = ceil(($activePokemon['base_attack'] / 10) * $typeMultiplier);
    $damage = max(1, $damage); // Minimum 1 damage
    
    $newHp = $wildPokemon['current_hp'] - $damage;
    $defeated = $newHp <= 0;
    
    // Grant EXP to attacking Pokemon: 2 EXP if wild Pokemon faints, 1 EXP otherwise
    $expGained = $defeated ? 2 : 1;
    $stmt = $db->prepare("UPDATE player_pokemon SET current_exp = current_exp + ? WHERE id = ?");
    $stmt->execute([$expGained, $activePokemon['id']]);
    
    // Check for evolution
    $evolved = checkEvolution($db, $activePokemon['id']);
    
    if ($defeated) {
        // Wild Pokemon defeated - escapes
        $stmt = $db->prepare("UPDATE wild_pokemon SET is_active = FALSE, current_hp = 0 WHERE id = ?");
        $stmt->execute([$wildPokemon['id']]);
    } else {
        // Update HP
        $stmt = $db->prepare("UPDATE wild_pokemon SET current_hp = ? WHERE id = ?");
        $stmt->execute([$newHp, $wildPokemon['id']]);
    }
    
    // Advance turn - encounter ends only if Pokemon was defeated
    advanceTurn($db, $roomId, $room, $defeated);
    
    // Add game event
    addGameEvent($roomId, 'attack', [
        'player_id' => $playerId,
        'player_name' => $player['player_name'],
        'attacker_name' => $activePokemon['pokemon_name'],
        'target_name' => $wildPokemon['name'],
        'damage' => $damage,
        'type_multiplier' => $typeMultiplier,
        'remaining_hp' => max(0, $newHp),
        'defeated' => $defeated,
        'evolved' => $evolved
    ]);
    
    jsonResponse([
        'success' => true,
        'damage' => $damage,
        'type_multiplier' => $typeMultiplier,
        'remaining_hp' => max(0, $newHp),
        'max_hp' => $wildPokemon['max_hp'],
        'defeated' => $defeated,
        'exp_gained' => $expGained,
        'evolved' => $evolved
    ]);
}

/**
 * Get route info
 */
function getRouteInfo() {
    $db = getDB();
    
    $routeNumber = intval($_GET['route'] ?? 1);
    
    $stmt = $db->prepare("
        SELECT r.*, 
               (SELECT COUNT(*) FROM route_pokemon WHERE route_id = r.id) as pokemon_count
        FROM routes r 
        WHERE r.route_number = ?
    ");
    $stmt->execute([$routeNumber]);
    $route = $stmt->fetch();
    
    if (!$route) {
        jsonResponse(['error' => 'Route not found'], 404);
    }
    
    // Get Pokemon on this route
    $stmt = $db->prepare("
        SELECT pd.name, pd.type_defense, pd.sprite_url
        FROM route_pokemon rp
        JOIN pokemon_dex pd ON rp.pokemon_id = pd.id
        WHERE rp.route_id = ?
    ");
    $stmt->execute([$route['id']]);
    $pokemon = $stmt->fetchAll();
    
    jsonResponse([
        'success' => true,
        'route' => $route,
        'pokemon' => $pokemon
    ]);
}

/**
 * Set a Pokemon as the active one for the player
 */
function setActivePokemon() {
    $db = getDB();
    
    $playerId = $_SESSION['player_id'] ?? null;
    $roomId = $_SESSION['room_id'] ?? null;
    
    if (!$playerId || !$roomId) {
        jsonResponse(['error' => 'Not in a room'], 400);
    }
    
    $pokemonId = intval($_POST['pokemon_id'] ?? 0);
    
    if (!$pokemonId) {
        jsonResponse(['error' => 'Pokemon ID required'], 400);
    }
    
    // Verify this Pokemon belongs to the player
    $stmt = $db->prepare("
        SELECT pp.id, pd.name 
        FROM player_pokemon pp
        JOIN pokemon_dex pd ON pp.pokemon_id = pd.id
        WHERE pp.id = ? AND pp.player_id = ?
    ");
    $stmt->execute([$pokemonId, $playerId]);
    $pokemon = $stmt->fetch();
    
    if (!$pokemon) {
        jsonResponse(['error' => 'Pokemon not found in your team'], 404);
    }
    
    // Deactivate all Pokemon for this player
    $stmt = $db->prepare("UPDATE player_pokemon SET is_active = FALSE WHERE player_id = ?");
    $stmt->execute([$playerId]);
    
    // Activate the selected Pokemon
    $stmt = $db->prepare("UPDATE player_pokemon SET is_active = TRUE WHERE id = ?");
    $stmt->execute([$pokemonId]);
    
    // Get player name for the event
    $stmt = $db->prepare("SELECT player_name FROM players WHERE id = ?");
    $stmt->execute([$playerId]);
    $player = $stmt->fetch();
    
    // Add game event
    addGameEvent($roomId, 'pokemon_switched', [
        'player_id' => $playerId,
        'player_name' => $player['player_name'],
        'pokemon_name' => $pokemon['name']
    ]);
    
    jsonResponse([
        'success' => true,
        'message' => $pokemon['name'] . ' is now your active Pokémon!'
    ]);
}

/**
 * Advance to next player's turn
 * Each action (catch or attack) consumes the current player's turn.
 * When an encounter ends (Pokemon caught or defeated), a new wild Pokemon spawns.
 * The route ends when ALL players have used their 8 turns.
 * 
 * @param bool $encounterEnded - true if the wild Pokemon was caught or defeated
 */
function advanceTurn($db, $roomId, $room, $encounterEnded = false) {
    // Get all players ordered by player_number
    $stmt = $db->prepare("SELECT id, player_number, turns_taken FROM players WHERE room_id = ? ORDER BY player_number");
    $stmt->execute([$roomId]);
    $players = $stmt->fetchAll();
    $playerCount = count($players);
    
    if ($playerCount === 0) return;
    
    // Increment turns_taken for the current player (every action = 1 turn used)
    $currentTurnNumber = $room['current_player_turn'];
    $stmt = $db->prepare("UPDATE players SET turns_taken = turns_taken + 1 WHERE room_id = ? AND player_number = ?");
    $stmt->execute([$roomId, $currentTurnNumber]);
    
    // Refresh player data after increment
    $stmt = $db->prepare("SELECT id, player_number, turns_taken FROM players WHERE room_id = ? ORDER BY player_number");
    $stmt->execute([$roomId]);
    $players = $stmt->fetchAll();
    
    // Check if ALL players have reached TURNS_PER_PLAYER
    $allDone = true;
    foreach ($players as $p) {
        if ($p['turns_taken'] < TURNS_PER_PLAYER) {
            $allDone = false;
            break;
        }
    }
    
    if ($allDone) {
        // All players have used all their turns — end catching phase, move to town
        // Store town_deadline in game_data (60 seconds for town phase)
        $townDeadline = time() + 60;
        $townGameData = json_encode(['town_deadline' => $townDeadline]);
        $stmt = $db->prepare("
            UPDATE rooms 
            SET game_state = 'town', 
                current_player_turn = 0,
                encounters_remaining = 0,
                game_data = ?
            WHERE id = ?
        ");
        $stmt->execute([$townGameData, $roomId]);
        
        // Give all players town income
        $stmt = $db->prepare("UPDATE players SET money = money + ? WHERE room_id = ?");
        $stmt->execute([TOWN_INCOME, $roomId]);
        
        // Clear wild pokemon
        $stmt = $db->prepare("DELETE FROM wild_pokemon WHERE room_id = ?");
        $stmt->execute([$roomId]);
        
        addGameEvent($roomId, 'phase_changed', [
            'new_phase' => 'town',
            'message' => 'All turns played! Welcome to Town! All players receive R$' . TOWN_INCOME . '.'
        ]);
        return;
    }
    
    // Find the next player who still has turns remaining
    // Start searching from the next player in rotation
    $nextTurn = ($currentTurnNumber + 1) % $playerCount;
    for ($i = 0; $i < $playerCount; $i++) {
        $candidateNumber = ($currentTurnNumber + 1 + $i) % $playerCount;
        $candidate = null;
        foreach ($players as $p) {
            if ($p['player_number'] == $candidateNumber) {
                $candidate = $p;
                break;
            }
        }
        if ($candidate && $candidate['turns_taken'] < TURNS_PER_PLAYER) {
            $nextTurn = $candidateNumber;
            break;
        }
    }
    
    // If the encounter ended (Pokemon caught or defeated), try to spawn a new wild Pokemon
    if ($encounterEnded) {
        $spawned = spawnWildPokemonForRoom($db, $roomId);
        if (!$spawned) {
            // No more unique Pokemon available — allow duplicates from route
            // This shouldn't block progression since turns drive the phase, not encounters
        }
    }
    
    // Update room with next player's turn and set turn deadline
    $turnDeadline = time() + 5;
    $turnGameData = json_encode(['turn_deadline' => $turnDeadline]);
    $stmt = $db->prepare("UPDATE rooms SET current_player_turn = ?, game_data = ? WHERE id = ?");
    $stmt->execute([$nextTurn, $turnGameData, $roomId]);
    
    // Get current player's updated turns info for the event
    $currentPlayerTurns = 0;
    foreach ($players as $p) {
        if ($p['player_number'] == $currentTurnNumber) {
            $currentPlayerTurns = $p['turns_taken'];
            break;
        }
    }
    
    addGameEvent($roomId, 'turn_changed', [
        'player_turn' => $nextTurn,
        'previous_player_turns_taken' => $currentPlayerTurns,
        'turns_per_player' => TURNS_PER_PLAYER,
        'encounter_ended' => $encounterEnded,
        'turn_deadline' => $turnDeadline
    ]);
}

/**
 * Spawn a wild Pokemon for a given room (internal helper)
 * @return bool - true if a Pokemon was spawned, false if no unique Pokemon available
 */
function spawnWildPokemonForRoom($db, $roomId) {
    // Check if there's already an active wild Pokemon
    $stmt = $db->prepare("SELECT id FROM wild_pokemon WHERE room_id = ? AND is_active = TRUE");
    $stmt->execute([$roomId]);
    if ($stmt->fetch()) {
        return true; // Already have one
    }
    
    // Get room info
    $stmt = $db->prepare("SELECT current_route FROM rooms WHERE id = ?");
    $stmt->execute([$roomId]);
    $room = $stmt->fetch();
    
    // Get route ID
    $stmt = $db->prepare("SELECT id FROM routes WHERE route_number = ?");
    $stmt->execute([$room['current_route'] ?? 1]);
    $route = $stmt->fetch();
    
    if (!$route) {
        return false; // No route found
    }
    
    // Get Pokemon already encountered this phase (to avoid duplicates)
    $stmt = $db->prepare("
        SELECT DISTINCT pokemon_id FROM wild_pokemon WHERE room_id = ?
    ");
    $stmt->execute([$roomId]);
    $encounteredIds = $stmt->fetchAll(PDO::FETCH_COLUMN);
    
    // Get random Pokemon from route (excluding already encountered)
    if (count($encounteredIds) > 0) {
        $placeholders = implode(',', array_fill(0, count($encounteredIds), '?'));
        $params = array_merge([$route['id']], $encounteredIds);
        
        $stmt = $db->prepare("
            SELECT pd.* FROM route_pokemon rp
            JOIN pokemon_dex pd ON rp.pokemon_id = pd.id
            WHERE rp.route_id = ? AND pd.id NOT IN ($placeholders)
            ORDER BY RAND()
            LIMIT 1
        ");
        $stmt->execute($params);
    } else {
        $stmt = $db->prepare("
            SELECT pd.* FROM route_pokemon rp
            JOIN pokemon_dex pd ON rp.pokemon_id = pd.id
            WHERE rp.route_id = ?
            ORDER BY RAND()
            LIMIT 1
        ");
        $stmt->execute([$route['id']]);
    }
    
    $pokemon = $stmt->fetch();
    
    if (!$pokemon) {
        // All unique Pokemon from this route have been encountered — allow duplicates
        $stmt = $db->prepare("
            SELECT pd.* FROM route_pokemon rp
            JOIN pokemon_dex pd ON rp.pokemon_id = pd.id
            WHERE rp.route_id = ?
            ORDER BY RAND()
            LIMIT 1
        ");
        $stmt->execute([$route['id']]);
        $pokemon = $stmt->fetch();
    }
    
    if (!$pokemon) {
        // No Pokemon at all on this route (shouldn't happen)
        return false;
    }
    
    // Calculate wild Pokemon HP: (base_hp / 10) * 3
    $wildHp = ceil(($pokemon['base_hp'] / 10) * 3);
    
    // Spawn the wild Pokemon
    $stmt = $db->prepare("
        INSERT INTO wild_pokemon (room_id, pokemon_id, current_hp, max_hp, is_active)
        VALUES (?, ?, ?, ?, TRUE)
    ");
    $stmt->execute([$roomId, $pokemon['id'], $wildHp, $wildHp]);
    
    // Add game event
    addGameEvent($roomId, 'wild_pokemon_appeared', [
        'pokemon_id' => $pokemon['id'],
        'pokemon_name' => $pokemon['name'],
        'sprite_url' => $pokemon['sprite_url'],
        'hp' => $wildHp,
        'max_hp' => $wildHp
    ]);
    
    return true;
}

/**
 * Check if Pokemon should evolve
 */
function checkEvolution($db, $playerPokemonId) {
    $stmt = $db->prepare("
        SELECT pp.*, pd.evolution_id, pd.name
        FROM player_pokemon pp
        JOIN pokemon_dex pd ON pp.pokemon_id = pd.id
        WHERE pp.id = ?
    ");
    $stmt->execute([$playerPokemonId]);
    $pokemon = $stmt->fetch();
    
    if (!$pokemon || !$pokemon['evolution_id'] || $pokemon['current_exp'] < EXP_TO_EVOLVE) {
        return false;
    }
    
    // Evolve the Pokemon
    $stmt = $db->prepare("
        UPDATE player_pokemon 
        SET pokemon_id = ?, current_exp = 0 
        WHERE id = ?
    ");
    $stmt->execute([$pokemon['evolution_id'], $playerPokemonId]);
    
    // Get evolved Pokemon name
    $stmt = $db->prepare("SELECT name FROM pokemon_dex WHERE id = ?");
    $stmt->execute([$pokemon['evolution_id']]);
    $evolvedName = $stmt->fetch()['name'];
    
    return [
        'from' => $pokemon['name'],
        'to' => $evolvedName
    ];
}

/**
 * Get type effectiveness multiplier (Gen 5 type chart)
 * Type names must match database: normal, fire, water, grass, electric, ice, fighting, 
 * poison, ground, flying, psychic, bug, rock, ghost, dragon, dark, steel
 */
function getTypeEffectiveness($attackType, $defenseType) {
    $typeChart = [
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
    
    if (isset($typeChart[$attackType][$defenseType])) {
        return $typeChart[$attackType][$defenseType];
    }
    return 1.0; // Default neutral effectiveness
}

/**
 * Helper: Add game event for SSE and WebSocket
 */
function addGameEvent($roomId, $eventType, $eventData) {
    // Use centralized broadcast function (writes to DB + sends to WebSocket)
    broadcastEvent($roomId, $eventType, $eventData);
}

/**
 * Enforce catching deadline: auto-catch (regular ball) for the current player
 * and advance the turn. Loops if multiple consecutive turns have timed out.
 * @return bool True if any auto-action occurred
 */
function enforceCatchingDeadline($db, $roomId) {
    $didAutoAction = false;
    
    // Use a transaction with row-level locking to prevent race conditions
    $db->beginTransaction();
    try {
        // Lock the room row
        $stmt = $db->prepare("SELECT * FROM rooms WHERE id = ? FOR UPDATE");
        $stmt->execute([$roomId]);
        $room = $stmt->fetch();
        
        if (!$room || $room['game_state'] !== 'catching') {
            $db->commit();
            return false;
        }
        
        $gd = $room['game_data'] ? json_decode($room['game_data'], true) : [];
        $turnDeadline = $gd['turn_deadline'] ?? null;
        
        if (!$turnDeadline || time() <= $turnDeadline) {
            $db->commit();
            return false;
        }
    
    $maxIterations = 50; // safety net (e.g. 4 players × 8 turns = 32 max)
    for ($iter = 0; $iter < $maxIterations; $iter++) {
        // Re-fetch room state each iteration
        $stmt = $db->prepare("SELECT * FROM rooms WHERE id = ?");
        $stmt->execute([$roomId]);
        $room = $stmt->fetch();
        
        if ($room['game_state'] !== 'catching') {
            break; // Phase changed (all turns done → town)
        }
        
        $gd = $room['game_data'] ? json_decode($room['game_data'], true) : [];
        $turnDeadline = $gd['turn_deadline'] ?? null;
        
        if (!$turnDeadline || time() <= $turnDeadline) {
            break; // Deadline hasn't passed yet
        }
        
        $currentTurnNumber = $room['current_player_turn'];
        
        // Get current player
        $stmt = $db->prepare("SELECT id, player_number, player_name, ultra_balls, turns_taken FROM players WHERE room_id = ? AND player_number = ?");
        $stmt->execute([$roomId, $currentTurnNumber]);
        $player = $stmt->fetch();
        
        if (!$player) break;
        
        // Check if this player still has turns left
        if ($player['turns_taken'] >= TURNS_PER_PLAYER) {
            // This player is done — advance to next player and set new deadline
            $stmt = $db->prepare("SELECT id, player_number, turns_taken FROM players WHERE room_id = ? ORDER BY player_number");
            $stmt->execute([$roomId]);
            $allPlayers = $stmt->fetchAll();
            $playerCount = count($allPlayers);
            
            // Find next player with remaining turns
            $nextTurn = ($currentTurnNumber + 1) % $playerCount;
            for ($i = 0; $i < $playerCount; $i++) {
                $candidateNumber = ($currentTurnNumber + 1 + $i) % $playerCount;
                foreach ($allPlayers as $p) {
                    if ($p['player_number'] == $candidateNumber && $p['turns_taken'] < TURNS_PER_PLAYER) {
                        $nextTurn = $candidateNumber;
                        break 2;
                    }
                }
            }
            
            $newDeadline = time() + 5;
            $newGameData = json_encode(['turn_deadline' => $newDeadline]);
            $stmt = $db->prepare("UPDATE rooms SET current_player_turn = ?, game_data = ? WHERE id = ?");
            $stmt->execute([$nextTurn, $newGameData, $roomId]);
            $didAutoAction = true;
            continue;
        }
        
        // Get active wild Pokemon
        $stmt = $db->prepare("
            SELECT wp.*, pd.name, pd.base_hp, pd.catch_rate, pd.sprite_url
            FROM wild_pokemon wp
            JOIN pokemon_dex pd ON wp.pokemon_id = pd.id
            WHERE wp.room_id = ? AND wp.is_active = TRUE
            LIMIT 1
        ");
        $stmt->execute([$roomId]);
        $wildPokemon = $stmt->fetch();
        
        if (!$wildPokemon) {
            // No wild Pokemon — try to spawn one, then set new deadline
            spawnWildPokemonForRoom($db, $roomId);
            $newDeadline = time() + 5;
            $newGameData = json_encode(['turn_deadline' => $newDeadline]);
            $stmt = $db->prepare("UPDATE rooms SET game_data = ? WHERE id = ?");
            $stmt->execute([$newGameData, $roomId]);
            $didAutoAction = true;
            continue;
        }
        
        // Auto-catch attempt with regular ball
        $baseCatchRate = $wildPokemon['catch_rate'] ?? 30;
        $hpRatio = $wildPokemon['max_hp'] > 0 
            ? $wildPokemon['current_hp'] / $wildPokemon['max_hp'] 
            : 1;
        $hpBonus = round((1 - $hpRatio) * 40);
        $catchRate = min(95, $baseCatchRate + $hpBonus);
        
        $catchRoll = rand(0, 99);
        $caught = ($catchRoll < $catchRate);
        
        if ($caught) {
            // Check team size
            $stmt = $db->prepare("SELECT COUNT(*) as count FROM player_pokemon WHERE player_id = ?");
            $stmt->execute([$player['id']]);
            $teamCount = $stmt->fetch()['count'];
            
            if ($teamCount >= 6) {
                // Team full — give money
                $stmt = $db->prepare("UPDATE players SET money = money + 2 WHERE id = ?");
                $stmt->execute([$player['id']]);
            } else {
                // Add Pokemon to team
                $stmt = $db->prepare("
                    INSERT INTO player_pokemon (player_id, pokemon_id, current_hp, current_exp, is_active, team_position)
                    VALUES (?, ?, ?, 0, FALSE, ?)
                ");
                $stmt->execute([$player['id'], $wildPokemon['pokemon_id'], $wildPokemon['base_hp'], $teamCount]);
            }
            
            // Mark wild Pokemon as caught
            $stmt = $db->prepare("UPDATE wild_pokemon SET is_active = FALSE WHERE id = ?");
            $stmt->execute([$wildPokemon['id']]);
        }
        
        // Broadcast auto-catch event
        addGameEvent($roomId, 'catch_attempt', [
            'player_id' => $player['id'],
            'player_name' => $player['player_name'],
            'pokemon_name' => $wildPokemon['name'],
            'catch_roll' => $catchRoll,
            'dice_roll' => $catchRoll,
            'catch_rate' => $catchRate,
            'used_ultra_ball' => false,
            'caught' => $caught,
            'team_full' => false,
            'auto_action' => true
        ]);
        
        // Advance turn (this increments turns_taken and handles phase transition)
        advanceTurn($db, $roomId, $room, $caught);
        $didAutoAction = true;
    }
    
        $db->commit();
    } catch (Exception $e) {
        $db->rollBack();
        throw $e;
    }
    
    return $didAutoAction;
}
