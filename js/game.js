/**
 * PokeFodase - Main Game JavaScript
 * Handles UI, API calls, and SSE connection
 */

// Game State
const GameState = {
    roomCode: null,
    roomId: null,
    playerId: null,
    playerNumber: null,
    isHost: false,
    currentScreen: 'menu',
    selectedAvatar: 1,
    players: [],
    gameState: 'lobby',
    gameMode: 'casual', // 'casual' or 'ranked'
    eventSource: null,  // SSE fallback
    webSocket: null,    // WebSocket connection
    wsReconnectAttempts: 0,
    lastEventId: 0,
    // Account state
    account: null, // { id, nickname, code, avatar_id, elo, games_played, games_won }
    // Ranked queue
    rankedQueueInterval: null,
    // Catching phase state
    catchingState: null,
    wildPokemon: null,
    isMyTurn: false,
    currentRoute: 1,
    turnsPerPlayer: 8,
    myTurnsTaken: 0,
    catchAnimationInProgress: false,
    // Countdown timers
    catchingTimerInterval: null,
    catchingTimerSeconds: 0,
    townTimerInterval: null,
    townTimerSeconds: 0,
    // Polling/watchdog intervals
    selectionPollInterval: null,
    gameStateWatchdogInterval: null,
    // Initial selection timer (deadline-based for tab-throttle resilience)
    initialSelectionTimerInterval: null,
    initialSelectionDeadline: null
};

// Avatar options (using emojis for simplicity, can be replaced with images)
const AVATARS = ['🙂', '🐻‍❄️', '👻', '🐱', '🦊', '🐸', '😈', '🤖', '👽', '💩'];

// Battle State (tracks current battle)
const BattleState = {
    player1: null,
    player2: null,
    player1Team: [],
    player2Team: [],
    player1Active: null,
    player2Active: null,
    player1HasSelected: false,
    player2HasSelected: false,
    phase: 'selection', // selection, battle, finished
    currentTurn: null,
    turnNumber: 0,
    isMyBattle: false,
    amPlayer1: false,
    autoTurnTimer: null,
    battleLog: [],
    // NPC Battle fields
    isNpcBattle: false,
    npcData: null,
    // Type matchup indicators for selection UI
    typeMatchups: null,
    // Ranked mode fields
    isRankedMode: false,
    myMatchIndex: null,
    bracketSummary: [],
    rankedWaiting: false,
    // Selection timer fields (deadline-based for tab-throttle resilience)
    selectionTimerInterval: null,
    selectionDeadline: null, // absolute deadline in ms (Date.now()-based)
    selectionIsReplacement: false
};

// API Endpoints
const API = {
    room: 'api/room.php',
    sse: 'api/sse.php',
    game: 'api/game.php',
    pokemon: 'api/pokemon.php',
    catching: 'api/catching.php',
    town: 'api/town.php',
    tournament: 'api/tournament.php',
    account: 'api/account.php',
    ranked: 'api/ranked.php'
};

// WebSocket Configuration
const WS_CONFIG = {
    // Change this URL to your Node.js WebSocket server URL in production
    // For local development: 'ws://localhost:3000'
    // For production: 'wss://your-domain.com:3000' or via reverse proxy
    url: 'wss://poke.labzts.fun/ws',
    enabled: true,       // ← CHANGE from false to true
    reconnectDelay: 3000,
    maxReconnectAttempts: 10
};

// DOM Elements (cached on load)
let DOM = {};

/**
 * Initialize the game
 */
async function init() {
    cacheDOM();
    setupEventListeners();
    setupAvatarSelectors();
    
    // Check for saved account and restore backend session
    const hasAccount = await loadSavedAccount();
    
    // Only check existing PHP session if no account was restored
    // (restoreBackendSession already handles reconnection for logged-in users)
    if (!hasAccount) {
        checkExistingSession();
    }
}

/**
 * Cache frequently used DOM elements
 */
function cacheDOM() {
    DOM = {
        // Screens
        screens: {
            menu: document.getElementById('screen-menu'),
            lobby: document.getElementById('screen-lobby'),
            initial: document.getElementById('screen-initial'),
            catching: document.getElementById('screen-catching'),
            town: document.getElementById('screen-town'),
            tournament: document.getElementById('screen-tournament'),
            battle: document.getElementById('screen-battle'),
            victory: document.getElementById('screen-victory')
        },
        // Account
        accountSection: document.getElementById('account-section'),
        loggedInSection: document.getElementById('logged-in-section'),
        accountCreateView: document.getElementById('account-create-view'),
        accountLoginView: document.getElementById('account-login-view'),
        accountNicknameCreate: document.getElementById('account-nickname-create'),
        accountNicknameLogin: document.getElementById('account-nickname-login'),
        accountCode: document.getElementById('account-code'),
        btnAccountLogin: document.getElementById('btn-account-login'),
        btnAccountCreate: document.getElementById('btn-account-create'),
        btnShowLogin: document.getElementById('btn-show-login'),
        btnShowCreate: document.getElementById('btn-show-create'),
        btnAccountLogout: document.getElementById('btn-account-logout'),
        menuAccountName: document.getElementById('menu-account-name'),
        menuAccountElo: document.getElementById('menu-account-elo'),
        menuAccountAvatar: document.getElementById('menu-account-avatar'),
        codeDisplay: document.getElementById('code-display'),
        btnToggleCode: document.getElementById('btn-toggle-code'),
        accountAvatarSelector: document.getElementById('account-avatar-selector'),
        // Ranked
        btnRankedQueue: document.getElementById('btn-ranked-queue'),
        rankedQueuePanel: document.getElementById('ranked-queue-panel'),
        rankedQueueStatus: document.getElementById('ranked-queue-status'),
        rankedQueueCount: document.getElementById('ranked-queue-count'),
        btnLeaveQueue: document.getElementById('btn-leave-queue'),
        // Leaderboard
        btnLeaderboard: document.getElementById('btn-leaderboard'),
        leaderboardPanel: document.getElementById('leaderboard-panel'),
        leaderboardList: document.getElementById('leaderboard-list'),
        btnCloseLeaderboard: document.getElementById('btn-close-leaderboard'),
        // Menu
        btnCreateRoom: document.getElementById('btn-create-room'),
        btnJoinRoom: document.getElementById('btn-join-room'),
        createRoomForm: document.getElementById('create-room-form'),
        joinRoomForm: document.getElementById('join-room-form'),
        createRoomPreviewName: document.getElementById('create-room-preview-name'),
        roomCodeInput: document.getElementById('room-code-input'),
        btnConfirmCreate: document.getElementById('btn-confirm-create'),
        btnCancelCreate: document.getElementById('btn-cancel-create'),
        btnConfirmJoin: document.getElementById('btn-confirm-join'),
        btnCancelJoin: document.getElementById('btn-cancel-join'),
        // Lobby
        displayRoomCode: document.getElementById('display-room-code'),
        btnCopyCode: document.getElementById('btn-copy-code'),
        playersList: document.getElementById('players-list'),
        playerCount: document.getElementById('player-count'),
        btnStartGame: document.getElementById('btn-start-game'),
        btnLeaveRoom: document.getElementById('btn-leave-room'),
        hostIndicator: document.getElementById('host-indicator'),
        // Initial
        starterGrid: document.getElementById('starter-grid'),
        initialTurnIndicator: document.getElementById('initial-turn-indicator'),
        selectedList: document.getElementById('selected-list'),
        // Catching Phase
        routeName: document.getElementById('route-name'),
        encountersRemaining: document.getElementById('encounters-remaining'),
        routeProgress: document.getElementById('route-progress'),
        wildPokemonDisplay: document.getElementById('wild-pokemon-display'),
        wildPokemonPlaceholder: document.getElementById('wild-pokemon-placeholder'),
        wildPokemonImg: document.getElementById('wild-pokemon-img'),
        wildPokemonName: document.getElementById('wild-pokemon-name'),
        wildPokemonTypeDef: document.getElementById('wild-pokemon-type-def'),
        wildPokemonTypeAtk: document.getElementById('wild-pokemon-type-atk'),
        wildPokemonAtk: document.getElementById('wild-pokemon-atk'),
        wildPokemonSpd: document.getElementById('wild-pokemon-spd'),
        wildHpBar: document.getElementById('wild-hp-bar'),
        wildHpText: document.getElementById('wild-hp-text'),
        wildCatchRate: document.getElementById('wild-catch-rate'),
        wildCatchRateDisplay: document.getElementById('wild-catch-rate-display'),
        catchingTurnIndicator: document.getElementById('catching-turn-indicator'),
        currentTurnName: document.getElementById('current-turn-name'),
        btnCatch: document.getElementById('btn-catch'),
        btnUltraCatch: document.getElementById('btn-ultra-catch'),
        btnAttack: document.getElementById('btn-attack'),
        ultraBallCount: document.getElementById('ultra-ball-count'),
        catchingLogMessages: document.getElementById('catching-log-messages'),
        catchingPlayersPanel: document.getElementById('catching-players-panel'),
        // Victory
        winnerName: document.getElementById('winner-name'),
        victoryMessage: document.getElementById('victory-message'),
        // Battle Screen
        battleP1Avatar: document.getElementById('battle-p1-avatar'),
        battleP1Name: document.getElementById('battle-p1-name'),
        battleP2Avatar: document.getElementById('battle-p2-avatar'),
        battleP2Name: document.getElementById('battle-p2-name'),
        battleP1Sprite: document.getElementById('battle-p1-sprite'),
        battleP1PokemonName: document.getElementById('battle-p1-pokemon-name'),
        battleP1HpBar: document.getElementById('battle-p1-hp-bar'),
        battleP1HpText: document.getElementById('battle-p1-hp-text'),
        battleP1Team: document.getElementById('battle-p1-team'),
        battleP1Stats: document.getElementById('battle-p1-stats'),
        battleP1Attack: document.getElementById('battle-p1-attack'),
        battleP1Speed: document.getElementById('battle-p1-speed'),
        battleP1TypeAtk: document.getElementById('battle-p1-type-atk'),
        battleP1TypeDef: document.getElementById('battle-p1-type-def'),
        battleP2Sprite: document.getElementById('battle-p2-sprite'),
        battleP2PokemonName: document.getElementById('battle-p2-pokemon-name'),
        battleP2HpBar: document.getElementById('battle-p2-hp-bar'),
        battleP2HpText: document.getElementById('battle-p2-hp-text'),
        battleP2Team: document.getElementById('battle-p2-team'),
        battleP2Stats: document.getElementById('battle-p2-stats'),
        battleP2Attack: document.getElementById('battle-p2-attack'),
        battleP2Speed: document.getElementById('battle-p2-speed'),
        battleP2TypeAtk: document.getElementById('battle-p2-type-atk'),
        battleP2TypeDef: document.getElementById('battle-p2-type-def'),
        battleStatus: document.getElementById('battle-status'),
        battleActionDisplay: document.getElementById('battle-action-display'),
        battleActionText: document.getElementById('battle-action-text'),
        battleSelectionPanel: document.getElementById('battle-selection-panel'),
        battleSelectionTitle: document.getElementById('battle-selection-title'),
        battleSelectionGrid: document.getElementById('battle-selection-grid'),
        selectionTimer: document.getElementById('selection-timer'),
        timerProgress: document.getElementById('timer-progress'),
        timerText: document.getElementById('timer-text'),
        battleLogMessages: document.getElementById('battle-log-messages'),
        battleP1Pokemon: document.getElementById('battle-p1-pokemon'),
        battleP2Pokemon: document.getElementById('battle-p2-pokemon'),
        // Utility
        toastContainer: document.getElementById('toast-container'),
        loadingOverlay: document.getElementById('loading-overlay'),
        // Floating Leave Button
        btnLeaveGame: document.getElementById('btn-leave-game')
    };
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Account buttons
    DOM.btnAccountLogin?.addEventListener('click', loginAccount);
    DOM.btnAccountCreate?.addEventListener('click', createAccount);
    DOM.btnAccountLogout?.addEventListener('click', logoutAccount);
    DOM.btnShowLogin?.addEventListener('click', showLoginView);
    DOM.btnShowCreate?.addEventListener('click', showCreateView);
    
    // Code reveal toggle
    DOM.btnToggleCode?.addEventListener('click', toggleCodeReveal);
    DOM.codeDisplay?.addEventListener('click', toggleCodeReveal);
    
    // Ranked queue
    DOM.btnRankedQueue?.addEventListener('click', joinRankedQueue);
    DOM.btnLeaveQueue?.addEventListener('click', leaveRankedQueue);
    
    // Leaderboard
    DOM.btnLeaderboard?.addEventListener('click', showLeaderboard);
    DOM.btnCloseLeaderboard?.addEventListener('click', () => {
        DOM.leaderboardPanel?.classList.add('hidden');
    });
    
    // Menu buttons
    DOM.btnCreateRoom.addEventListener('click', () => showForm('create'));
    DOM.btnJoinRoom.addEventListener('click', () => showForm('join'));
    DOM.btnCancelCreate.addEventListener('click', () => hideForm('create'));
    DOM.btnCancelJoin.addEventListener('click', () => hideForm('join'));
    DOM.btnConfirmCreate.addEventListener('click', createRoom);
    DOM.btnConfirmJoin.addEventListener('click', joinRoom);
    
    // Lobby buttons
    DOM.btnCopyCode.addEventListener('click', copyRoomCode);
    DOM.btnStartGame.addEventListener('click', startGame);
    DOM.btnLeaveRoom.addEventListener('click', leaveRoom);
    
    // Floating leave game button (for leaving during any game phase)
    DOM.btnLeaveGame?.addEventListener('click', leaveGameConfirm);
    
    // Catching phase buttons
    DOM.btnCatch?.addEventListener('click', () => attemptCatch(false));
    DOM.btnUltraCatch?.addEventListener('click', () => attemptCatch(true));
    DOM.btnAttack?.addEventListener('click', attackWildPokemon);
    
    // Keyboard shortcuts for catching phase
    document.addEventListener('keydown', handleCatchingKeyboard);
    
    // Visibility change: immediately recalculate timers
    // when the tab regains focus (browsers throttle setInterval in bg tabs)
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            if (BattleState.selectionDeadline) {
                tickSelectionTimer();
            }
            if (GameState.initialSelectionDeadline) {
                tickInitialSelectionTimer();
            }
        }
    });
    
    // Enter key for forms
    DOM.roomCodeInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') joinRoom();
    });
}

/**
 * Setup avatar selector options (account creation only)
 */
function setupAvatarSelectors() {
    const selector = DOM.accountAvatarSelector;
    if (!selector) return;
    AVATARS.forEach((avatar, index) => {
        const option = document.createElement('div');
        option.className = 'avatar-option' + (index === 0 ? ' selected' : '');
        option.textContent = avatar;
        option.dataset.avatarId = index + 1;
        option.addEventListener('click', () => selectAvatar(option, selector));
        selector.appendChild(option);
    });
}

/**
 * Select an avatar
 */
function selectAvatar(option, selector) {
    selector.querySelectorAll('.avatar-option').forEach(opt => opt.classList.remove('selected'));
    option.classList.add('selected');
    GameState.selectedAvatar = parseInt(option.dataset.avatarId);
}

/**
 * Show form (create or join)
 */
function showForm(type) {
    DOM.createRoomForm.classList.add('hidden');
    DOM.joinRoomForm.classList.add('hidden');
    
    if (type === 'create') {
        DOM.createRoomForm.classList.remove('hidden');
        // Show account name preview
        if (DOM.createRoomPreviewName && GameState.account) {
            const avatarIndex = (GameState.account.avatar_id || 1) - 1;
            DOM.createRoomPreviewName.textContent = `${AVATARS[avatarIndex] || AVATARS[0]} ${GameState.account.nickname}`;
        }
    } else {
        DOM.joinRoomForm.classList.remove('hidden');
        DOM.roomCodeInput.focus();
    }
}

/**
 * Hide form
 */
function hideForm(type) {
    if (type === 'create') {
        DOM.createRoomForm.classList.add('hidden');
    } else {
        DOM.joinRoomForm.classList.add('hidden');
    }
}

// ============================================
// ACCOUNT MANAGEMENT FUNCTIONS
// ============================================

/**
 * Load saved account from localStorage
 */
/**
 * Show the login view and hide the create account view
 */
function showLoginView() {
    DOM.accountCreateView?.classList.add('hidden');
    DOM.accountLoginView?.classList.remove('hidden');
}

/**
 * Show the create account view and hide the login view
 */
function showCreateView() {
    DOM.accountLoginView?.classList.add('hidden');
    DOM.accountCreateView?.classList.remove('hidden');
}

async function loadSavedAccount() {
    const saved = localStorage.getItem('pokefodase_account');
    if (saved) {
        try {
            GameState.account = JSON.parse(saved);
            updateAccountUI();
            // Restore backend session and check for active game
            await restoreBackendSession();
            return true;
        } catch (e) {
            localStorage.removeItem('pokefodase_account');
        }
    }
    return false;
}

/**
 * Save account to localStorage
 */
function saveAccount(account) {
    GameState.account = account;
    localStorage.setItem('pokefodase_account', JSON.stringify(account));
    updateAccountUI();
}

/**
 * Restore backend PHP session from saved account data
 * Also checks for an active game and reconnects to it
 */
async function restoreBackendSession() {
    if (!GameState.account) return;
    
    try {
        const result = await apiCall(`${API.account}?action=restore_session`, {
            account_id: GameState.account.id,
            code: GameState.account.code
        });
        
        if (result.success) {
            // Update local account data with fresh data from server
            if (result.account) {
                saveAccount(result.account);
            }
            
            // If there's an active game, reconnect to it
            if (result.active_game) {
                console.log('Active game found, reconnecting:', result.active_game);
                GameState.roomCode = result.active_game.room_code;
                GameState.roomId = result.active_game.room_id;
                GameState.playerId = result.active_game.player_id;
                GameState.playerNumber = parseInt(result.active_game.player_number);
                GameState.isHost = result.active_game.is_host;
                GameState.gameMode = result.active_game.game_mode || 'casual';
                
                showToast('Reconectado à partida!', 'success');
                enterLobby();
                handleGameStateChange(result.active_game.game_state);
            }
        } else {
            // Session restore failed — account may be invalid, clear it
            console.warn('Session restore failed:', result.error);
            GameState.account = null;
            localStorage.removeItem('pokefodase_account');
            updateAccountUI();
        }
    } catch (error) {
        console.error('Error restoring session:', error);
        // Don't clear account on network error, might be temporary
    }
}

/**
 * Update account UI elements
 */
function updateAccountUI() {
    if (GameState.account) {
        DOM.accountSection?.classList.add('hidden');
        DOM.loggedInSection?.classList.remove('hidden');
        if (DOM.menuAccountName) DOM.menuAccountName.textContent = GameState.account.nickname;
        if (DOM.menuAccountElo) DOM.menuAccountElo.textContent = `ELO: ${GameState.account.elo}`;
        if (DOM.menuAccountAvatar) {
            const avatarIndex = (GameState.account.avatar_id || 1) - 1;
            DOM.menuAccountAvatar.textContent = AVATARS[avatarIndex] || AVATARS[0];
        }
        // Reset code display to hidden state
        if (DOM.codeDisplay) {
            DOM.codeDisplay.textContent = '••••••••';
            DOM.codeDisplay.dataset.revealed = 'false';
        }
    } else {
        DOM.accountSection?.classList.remove('hidden');
        DOM.loggedInSection?.classList.add('hidden');
    }
}

/**
 * Toggle the visibility of the player's account code
 */
function toggleCodeReveal() {
    if (!DOM.codeDisplay || !GameState.account) return;
    const isRevealed = DOM.codeDisplay.dataset.revealed === 'true';
    if (isRevealed) {
        DOM.codeDisplay.textContent = '••••••••';
        DOM.codeDisplay.dataset.revealed = 'false';
        DOM.codeDisplay.classList.remove('revealed');
    } else {
        DOM.codeDisplay.textContent = GameState.account.code;
        DOM.codeDisplay.dataset.revealed = 'true';
        DOM.codeDisplay.classList.add('revealed');
        // Copy to clipboard
        navigator.clipboard.writeText(GameState.account.code).then(() => {
            showToast('Código copiado!', 'success', 2000);
        }).catch(() => {});
    }
}

/**
 * Create a new account
 */
async function createAccount() {
    const nickname = DOM.accountNicknameCreate?.value?.trim();
    if (!nickname || nickname.length < 2) {
        showToast('Nickname deve ter pelo menos 2 caracteres', 'warning');
        return;
    }
    
    setLoading(true);
    try {
        const result = await apiCall(`${API.account}?action=create`, { 
            nickname,
            avatar_id: GameState.selectedAvatar 
        });
        if (result.success) {
            saveAccount(result.account);
            showToast(`Conta criada! Seu código: ${result.account.code}. Salve!`, 'success', 8000);
        } else {
            showToast(result.error || 'Erro ao criar conta', 'error');
        }
    } catch (error) {
        console.error('Error creating account:', error);
        showToast('Erro ao criar conta', 'error');
    } finally {
        setLoading(false);
    }
}

/**
 * Login to an existing account
 */
async function loginAccount() {
    const nickname = DOM.accountNicknameLogin?.value?.trim();
    const code = DOM.accountCode?.value?.trim();
    
    if (!nickname) {
        showToast('Digite seu nickname', 'warning');
        return;
    }
    if (!code || code.length !== 8) {
        showToast('Código deve ter 8 dígitos', 'warning');
        return;
    }
    
    setLoading(true);
    try {
        const result = await apiCall(`${API.account}?action=login`, { nickname, code });
        if (result.success) {
            saveAccount(result.account);
            showToast(`Bem-vindo, ${result.account.nickname}!`, 'success');
        } else {
            showToast(result.error || 'Login falhou', 'error');
        }
    } catch (error) {
        console.error('Error logging in:', error);
        showToast('Erro ao fazer login', 'error');
    } finally {
        setLoading(false);
    }
}

/**
 * Logout
 */
function logoutAccount() {
    GameState.account = null;
    localStorage.removeItem('pokefodase_account');
    updateAccountUI();
    showToast('Desconectado', 'info');
}

// ============================================
// RANKED QUEUE FUNCTIONS
// ============================================

/**
 * Join the ranked matchmaking queue
 */
async function joinRankedQueue() {
    if (!GameState.account) {
        showToast('Faça login primeiro!', 'warning');
        return;
    }
    
    setLoading(true);
    try {
        const result = await apiCall(`${API.ranked}?action=join_queue`, {});
        if (result.success) {
            if (result.status === 'matched') {
                // Match found! Enter the game
                showToast('Partida encontrada!', 'success');
                GameState.roomCode = result.room_code;
                GameState.roomId = result.room_id;
                GameState.playerId = result.player_id;
                GameState.playerNumber = parseInt(result.player_number);
                GameState.gameMode = 'ranked';
                DOM.rankedQueuePanel?.classList.add('hidden');
                setLoading(false);
                enterLobby();
                return;
            }
            // Show queue panel
            DOM.rankedQueuePanel?.classList.remove('hidden');
            if (DOM.rankedQueueStatus) DOM.rankedQueueStatus.textContent = result.message;
            if (DOM.rankedQueueCount) {
                const total = result.total_needed || 4;
                DOM.rankedQueueCount.textContent = `${total - result.players_needed}/${total} jogadores`;
            }
            
            // Start polling for queue status
            startQueuePolling();
        } else {
            // Check if the error includes active game info for reconnection
            if (result.active_game) {
                showToast('Reconectando à partida ativa...', 'info');
                GameState.roomCode = result.active_game.room_code;
                GameState.roomId = result.active_game.room_id;
                GameState.playerId = result.active_game.player_id;
                GameState.playerNumber = parseInt(result.active_game.player_number);
                GameState.isHost = result.active_game.is_host;
                GameState.gameMode = result.active_game.game_mode || 'ranked';
                setLoading(false);
                enterLobby();
                handleGameStateChange(result.active_game.game_state);
                return;
            }
            showToast(result.error || 'Erro ao entrar na fila', 'error');
        }
    } catch (error) {
        console.error('Error joining ranked queue:', error);
        showToast('Erro ao entrar na fila ranqueada', 'error');
    } finally {
        setLoading(false);
    }
}

/**
 * Leave the ranked queue
 */
async function leaveRankedQueue() {
    stopQueuePolling();
    DOM.rankedQueuePanel?.classList.add('hidden');
    
    try {
        await apiCall(`${API.ranked}?action=leave_queue`, {});
        showToast('Saiu da fila', 'info');
    } catch (error) {
        console.error('Error leaving queue:', error);
    }
}

/**
 * Start polling for queue status updates
 */
function startQueuePolling() {
    stopQueuePolling();
    GameState.rankedQueueInterval = setInterval(async () => {
        try {
            const result = await apiCall(`${API.ranked}?action=check_queue`, {}, 'GET');
            if (result.success) {
                if (result.status === 'matched') {
                    stopQueuePolling();
                    showToast('Partida encontrada!', 'success');
                    GameState.roomCode = result.room_code;
                    GameState.roomId = result.room_id;
                    GameState.playerId = result.player_id;
                    GameState.playerNumber = parseInt(result.player_number);
                    GameState.gameMode = 'ranked';
                    DOM.rankedQueuePanel?.classList.add('hidden');
                    enterLobby();
                } else if (result.status === 'not_in_queue') {
                    stopQueuePolling();
                    DOM.rankedQueuePanel?.classList.add('hidden');
                } else {
                    if (DOM.rankedQueueCount) {
                        const total = result.total_needed || 4;
                        DOM.rankedQueueCount.textContent = `${total - (result.players_needed || 0)}/${total} jogadores`;
                    }
                }
            }
        } catch (error) {
            console.error('Queue poll error:', error);
        }
    }, 3000);
}

/**
 * Stop queue polling
 */
function stopQueuePolling() {
    if (GameState.rankedQueueInterval) {
        clearInterval(GameState.rankedQueueInterval);
        GameState.rankedQueueInterval = null;
    }
}

/**
 * Show leaderboard
 */
async function showLeaderboard() {
    DOM.leaderboardPanel?.classList.remove('hidden');
    DOM.leaderboardList.innerHTML = '<p>Carregando...</p>';
    
    try {
        const result = await apiCall(`${API.account}?action=leaderboard`, {}, 'GET');
        if (result.success && result.leaderboard) {
            DOM.leaderboardList.innerHTML = result.leaderboard.map((entry, i) => `
                <div class="leaderboard-row ${entry.id == GameState.account?.id ? 'is-self' : ''}">
                    <span class="lb-rank">#${i + 1}</span>
                    <span class="lb-name">${escapeHtml(entry.nickname)}</span>
                    <span class="lb-elo">ELO: ${entry.elo}</span>
                    <span class="lb-games">${entry.games_played} jogos</span>
                </div>
            `).join('');
        } else {
            DOM.leaderboardList.innerHTML = '<p>Erro ao carregar leaderboard</p>';
        }
    } catch (error) {
        DOM.leaderboardList.innerHTML = '<p>Erro ao carregar leaderboard</p>';
    }
}

// ============================================
// END ACCOUNT/RANKED FUNCTIONS
// ============================================

/**
 * Show/hide loading overlay
 */
function setLoading(show) {
    if (show) {
        DOM.loadingOverlay.classList.remove('hidden');
    } else {
        DOM.loadingOverlay.classList.add('hidden');
    }
}

/**
 * Show toast notification
 */
function showToast(message, type = 'info', duration = 3000) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    DOM.toastContainer.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideIn 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

/**
 * Switch to a different screen
 */
function switchScreen(screenName) {
    Object.values(DOM.screens).forEach(screen => screen.classList.remove('active'));
    DOM.screens[screenName].classList.add('active');
    GameState.currentScreen = screenName;
    
    // Show/hide floating leave button based on screen
    // Show on all screens except menu and victory
    if (DOM.btnLeaveGame) {
        if (screenName === 'menu' || screenName === 'victory') {
            DOM.btnLeaveGame.classList.add('hidden');
        } else {
            DOM.btnLeaveGame.classList.remove('hidden');
        }
    }
}

/**
 * Leave game with confirmation
 */
function leaveGameConfirm() {
    const message = GameState.isHost 
        ? 'Are you sure you want to leave? As the host, this will end the game for everyone!'
        : 'Are you sure you want to leave the game?';
    
    if (confirm(message)) {
        leaveGame();
    }
}

/**
 * Force leave the game and return to menu
 */
async function leaveGame() {
    setLoading(true);
    try {
        // Try to notify the server
        await apiCall(API.room, { action: 'leave' }).catch(() => {});
    } catch (e) {
        // Ignore errors - we're leaving anyway
    }
    
    // Disconnect real-time connection
    disconnectRealtime();
    stopSelectionPolling();
    stopGameStateWatchdog();
    stopCatchingTimer();
    stopTownTimer();
    
    // Reset all game state
    GameState.roomCode = null;
    GameState.roomId = null;
    GameState.playerId = null;
    GameState.playerNumber = null;
    GameState.isHost = false;
    GameState.players = [];
    GameState.gameState = 'lobby';
    GameState.catchingState = null;
    GameState.wildPokemon = null;
    GameState.isMyTurn = false;
    GameState.currentRoute = 1;
    GameState.turnsPerPlayer = 8;
    GameState.myTurnsTaken = 0;
    GameState.lastEventId = 0;
    
    setLoading(false);
    switchScreen('menu');
    showToast('Saiu do jogo', 'info');
}

/**
 * Return to menu from victory screen (or any end state)
 * Resets all game state and disconnects from server
 */
function returnToMenu() {
    console.log('Returning to menu...');
    
    // Disconnect real-time connection
    disconnectRealtime();
    stopSelectionPolling();
    stopGameStateWatchdog();
    stopCatchingTimer();
    stopTownTimer();
    
    // Reset GameState
    GameState.roomCode = null;
    GameState.roomId = null;
    GameState.playerId = null;
    GameState.playerNumber = null;
    GameState.isHost = false;
    GameState.players = [];
    GameState.gameState = 'lobby';
    GameState.catchingState = null;
    GameState.wildPokemon = null;
    GameState.isMyTurn = false;
    GameState.currentRoute = 1;
    GameState.turnsPerPlayer = 8;
    GameState.myTurnsTaken = 0;
    GameState.lastEventId = 0;
    GameState.starters = null;
    GameState.selectionState = null;
    
    // Reset BattleState
    BattleState.player1 = null;
    BattleState.player2 = null;
    BattleState.player1Team = [];
    BattleState.player2Team = [];
    BattleState.player1Active = null;
    BattleState.player2Active = null;
    BattleState.player1HasSelected = false;
    BattleState.player2HasSelected = false;
    BattleState.phase = 'selection';
    BattleState.currentTurn = null;
    BattleState.turnNumber = 0;
    BattleState.isMyBattle = false;
    BattleState.amPlayer1 = false;
    if (BattleState.autoTurnTimer) {
        clearTimeout(BattleState.autoTurnTimer);
        BattleState.autoTurnTimer = null;
    }
    stopSelectionTimer();
    BattleState.battleLog = [];
    
    // Reset TownState (if it exists)
    if (typeof TownState !== 'undefined') {
        TownState.playerMoney = 0;
        TownState.ultraBalls = 0;
        TownState.hasMegaStone = false;
        TownState.usedMegaStone = false;
        TownState.team = [];
        TownState.activeSlot = 0;
        TownState.isReady = false;
        TownState.players = [];
        TownState.selectedPokemonForSell = null;
        TownState.selectedPokemonForMega = null;
    }
    
    // Reset TournamentState (if it exists)
    if (typeof TournamentState !== 'undefined') {
        TournamentState.brackets = [];
        TournamentState.byePlayer = null;
        TournamentState.currentMatch = null;
        TournamentState.players = [];
        TournamentState.completedMatches = 0;
        TournamentState.totalMatches = 0;
        TournamentState.isParticipant = false;
        TournamentState.hostPlayerId = null;
        TournamentState.isTiebreaker = false;
        TournamentState.tiebreakerType = '';
        TournamentState.tiebreakerRound = 1;
        // Ranked mode fields
        TournamentState.gameMode = 'casual';
        TournamentState.allBattlesStarted = false;
        TournamentState.myMatchIndex = null;
        stopRankedCountdown();
    }
    
    // Reset ranked BattleState fields
    BattleState.isRankedMode = false;
    BattleState.myMatchIndex = null;
    BattleState.bracketSummary = [];
    BattleState.rankedWaiting = false;
    stopRankedBracketPolling();
    hideRankedWaitingOverlay();
    hideRankedBracketPanel();
    
    // Hide the floating leave button
    if (DOM.btnLeaveGame) {
        DOM.btnLeaveGame.classList.add('hidden');
    }
    
    // Switch to menu screen
    switchScreen('menu');
    
    // Clear any forms
    if (DOM.createPlayerName) DOM.createPlayerName.value = '';
    if (DOM.joinPlayerName) DOM.joinPlayerName.value = '';
    if (DOM.roomCodeInput) DOM.roomCodeInput.value = '';
    hideForm('create');
    hideForm('join');
    
    showToast('Voltou ao menu', 'info');
    console.log('Successfully returned to menu');
}

/**
 * API call helper with timeout
 */
async function apiCall(endpoint, data = {}, method = 'POST', timeoutMs = 15000) {
    const formData = new FormData();
    Object.entries(data).forEach(([key, value]) => formData.append(key, value));
    
    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    try {
        const response = await fetch(endpoint, {
            method,
            body: method === 'POST' ? formData : undefined,
            credentials: 'include',
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        // Get response text first for debugging
        const text = await response.text();
        console.log('API Response:', endpoint, text.substring(0, 500));
        
        // Try to parse as JSON
        try {
            return JSON.parse(text);
        } catch (e) {
            console.error('Failed to parse JSON:', text);
            return { success: false, error: 'Server returned invalid response' };
        }
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            console.error('API Timeout:', endpoint);
            return { success: false, error: 'Request timed out' };
        }
        console.error('API Error:', error);
        throw error;
    }
}

/**
 * Create a new room
 */
async function createRoom() {
    const playerName = GameState.account?.nickname || 'Player 1';
    const avatarId = GameState.account?.avatar_id || 1;
    
    setLoading(true);
    try {
        const result = await apiCall(API.room, {
            action: 'create',
            player_name: playerName,
            avatar_id: avatarId
        });
        
        if (result.success) {
            GameState.roomCode = result.room_code;
            GameState.roomId = result.room_id;
            GameState.playerId = result.player_id;
            GameState.playerNumber = parseInt(result.player_number);
            GameState.isHost = result.is_host;
            
            showToast('Sala criada com sucesso!', 'success');
            enterLobby();
        } else {
            showToast(result.error || 'Falha ao criar sala', 'error');
        }
    } catch (error) {
        showToast('Erro de conexão. Tente novamente.', 'error');
    }
    setLoading(false);
}

/**
 * Join an existing room
 */
async function joinRoom() {
    const roomCode = DOM.roomCodeInput.value.trim().toUpperCase();
    const playerName = GameState.account?.nickname || 'Player';
    const avatarId = GameState.account?.avatar_id || 1;
    
    if (!roomCode || roomCode.length !== 6) {
        showToast('Digite um código de sala válido com 6 caracteres', 'warning');
        return;
    }
    
    setLoading(true);
    try {
        console.log('Joining room:', roomCode, 'as', playerName);
        const result = await apiCall(API.room, {
            action: 'join',
            room_code: roomCode,
            player_name: playerName,
            avatar_id: avatarId
        });
        
        console.log('Join result:', result);
        
        if (result.success) {
            GameState.roomCode = result.room_code;
            GameState.roomId = result.room_id;
            GameState.playerId = result.player_id;
            GameState.playerNumber = parseInt(result.player_number);
            GameState.isHost = result.is_host;
            
            showToast(result.rejoined ? 'Reconectou à sala!' : 'Entrou na sala!', 'success');
            enterLobby();
        } else {
            showToast(result.error || 'Falha ao entrar na sala', 'error');
        }
    } catch (error) {
        console.error('Join error:', error);
        showToast('Erro de conexão. Tente novamente.', 'error');
    } finally {
        setLoading(false);
    }
}

/**
 * Enter the lobby screen
 */
function enterLobby() {
    switchScreen('lobby');
    DOM.displayRoomCode.textContent = GameState.roomCode;
    
    if (GameState.isHost) {
        DOM.hostIndicator.classList.remove('hidden');
    } else {
        DOM.hostIndicator.classList.add('hidden');
        DOM.btnStartGame.style.display = 'none';
    }
    
    // Start real-time connection (WebSocket with SSE fallback)
    connectRealtime();
    
    // Start game state watchdog (safety net for missed real-time events)
    startGameStateWatchdog();
    
    // Initial room state fetch
    refreshRoomState();
}

/**
 * Copy room code to clipboard
 */
async function copyRoomCode() {
    try {
        await navigator.clipboard.writeText(GameState.roomCode);
        showToast('Código copiado!', 'success');
    } catch (error) {
        showToast('Falha ao copiar código', 'error');
    }
}

/**
 * Leave the current room
 */
async function leaveRoom() {
    setLoading(true);
    try {
        await apiCall(API.room, { action: 'leave' });
        disconnectRealtime();
        
        // Reset state
        GameState.roomCode = null;
        GameState.roomId = null;
        GameState.playerId = null;
        GameState.isHost = false;
        GameState.players = [];
        
        switchScreen('menu');
        showToast('Saiu da sala', 'info');
    } catch (error) {
        showToast('Erro ao sair da sala', 'error');
    }
    setLoading(false);
}

/**
 * Start the game (host only)
 */
async function startGame() {
    if (!GameState.isHost) return;
    
    if (GameState.players.length < 2) {
        showToast('Precisa de pelo menos 2 jogadores para iniciar', 'warning');
        return;
    }
    
    setLoading(true);
    try {
        const result = await apiCall(API.room, { action: 'start_game' });
        
        if (result.success) {
            showToast('Jogo iniciando!', 'success');
            // Screen transition will happen via SSE event
        } else {
            showToast(result.error || 'Falha ao iniciar jogo', 'error');
        }
    } catch (error) {
        showToast('Erro de conexão', 'error');
    }
    setLoading(false);
}

/**
 * Refresh room state from server
 */
async function refreshRoomState() {
    try {
        console.log('Refreshing room state for:', GameState.roomCode);
        const result = await apiCall(`${API.room}?action=get_room&room_code=${GameState.roomCode}`, {}, 'GET');
        
        console.log('Room state result:', result);
        
        if (result.success) {
            GameState.players = result.players;
            GameState.gameState = result.room.game_state;
            updateLobbyUI();
            
            // Handle game state transitions
            handleGameStateChange(result.room.game_state);
        } else {
            console.error('Failed to get room state:', result.error);
        }
    } catch (error) {
        console.error('Failed to refresh room state:', error);
    }
}

/**
 * Update lobby UI with current players
 */
function updateLobbyUI() {
    DOM.playersList.innerHTML = '';
    DOM.playerCount.textContent = GameState.players.length;
    
    GameState.players.forEach(player => {
        const card = document.createElement('div');
        card.className = 'player-card';
        if (player.id == GameState.playerId) card.classList.add('is-you');
        if (player.is_host) card.classList.add('is-host');
        
        const avatarEmoji = AVATARS[player.avatar_id - 1] || '😎';
        
        card.innerHTML = `
            <div class="player-avatar">${avatarEmoji}</div>
            <div class="player-name">${escapeHtml(player.player_name)}</div>
            <div class="player-status ${player.is_ready ? 'ready' : ''}">
                ${player.is_host ? '👑 Anfitrião' : (player.is_ready ? '✓ Pronto' : 'Aguardando...')}
            </div>
        `;
        
        DOM.playersList.appendChild(card);
    });
    
    // Update start button state
    const canStart = GameState.isHost && GameState.players.length >= 2;
    DOM.btnStartGame.disabled = !canStart;
}

/**
 * Connect to Server-Sent Events
 */
function connectSSE() {
    if (GameState.eventSource) {
        GameState.eventSource.close();
    }
    
    const url = `${API.sse}?room_code=${GameState.roomCode}`;
    GameState.eventSource = new EventSource(url);
    
    GameState.eventSource.onopen = () => {
        console.log('SSE Connected');
    };
    
    GameState.eventSource.onerror = (error) => {
        console.error('SSE Error:', error);
        // Reconnect after delay
        setTimeout(() => {
            if (GameState.roomCode) {
                connectSSE();
            }
        }, 3000);
    };
    
    // Handle different event types
    GameState.eventSource.addEventListener('connected', (e) => {
        console.log('SSE connection confirmed');
    });
    
    GameState.eventSource.addEventListener('player_joined', (e) => {
        const data = JSON.parse(e.data);
        showToast(`${data.data.player_name} entrou!`, 'info');
        refreshRoomState();
    });
    
    GameState.eventSource.addEventListener('player_left', (e) => {
        const data = JSON.parse(e.data);
        showToast(`${data.data.player_name} saiu`, 'info');
        refreshRoomState();
    });
    
    GameState.eventSource.addEventListener('player_ready', (e) => {
        refreshRoomState();
    });
    
    GameState.eventSource.addEventListener('player_updated', (e) => {
        refreshRoomState();
    });
    
    GameState.eventSource.addEventListener('game_started', (e) => {
        const data = JSON.parse(e.data);
        const eventData = data.data || {};
        if (eventData.first_picker_name) {
            showToast(`Jogo iniciado! ${eventData.first_picker_name} escolhe primeiro!`, 'success');
        } else {
            showToast('Jogo iniciado!', 'success');
        }
        refreshRoomState();
    });
    
    GameState.eventSource.addEventListener('starter_selected', (e) => {
        const data = JSON.parse(e.data);
        const playerName = GameState.players.find(p => p.id == data.data.player_id)?.player_name || 'Um jogador';
        showToast(`${playerName} escolheu ${data.data.pokemon_name}!`, 'info');
        
        // Always refresh selection state - handles race conditions where
        // the event arrives before screen transition completes
        refreshSelectionState();
    });
    
    GameState.eventSource.addEventListener('phase_changed', (e) => {
        const data = JSON.parse(e.data);
        const eventData = data.data || {};
        
        // Show who goes first in catching phase
        if (eventData.new_phase === 'catching' && eventData.first_player_name) {
            showToast(`Indo para fase de captura! ${eventData.first_player_name} começa!`, 'success');
        } else {
            const phaseNames = {
                'catching': 'captura',
                'town': 'cidade',
                'tournament': 'torneio',
                'battle': 'batalha',
                'finished': 'fim'
            };
            const phaseName = phaseNames[eventData.new_phase] || eventData.new_phase;
            showToast(`Indo para fase de ${phaseName}!`, 'success');
        }
        handleGameStateChange(eventData.new_phase);
    });
    
    GameState.eventSource.addEventListener('state_sync', (e) => {
        const data = JSON.parse(e.data);
        handleGameStateChange(data.game_state);
    });
    
    // Catching phase events
    GameState.eventSource.addEventListener('wild_pokemon_appeared', (e) => {
        const data = JSON.parse(e.data);
        addCatchingLog(`Um ${data.data.pokemon_name} selvagem apareceu!`, 'wild');
        // Only refresh if we're not in the middle of a catch animation
        if (!GameState.catchAnimationInProgress) {
            refreshCatchingState();
        }
    });
    
    GameState.eventSource.addEventListener('catch_attempt', async (e) => {
        const data = JSON.parse(e.data);
        const isMyAttempt = data.data.player_id == GameState.playerId;
        
        // Block state refreshes during animation
        GameState.catchAnimationInProgress = true;
        
        // Show dice animation for all players
        await showInlineDiceAnimation(
            data.data.dice_roll,
            data.data.caught,
            data.data.used_ultra_ball
        );
        
        // Log the result
        if (data.data.caught) {
            if (data.data.team_full) {
                addCatchingLog(`${data.data.player_name} capturou ${data.data.pokemon_name} mas o time está cheio! Recebeu R$2.`, 'success');
            } else if (data.data.used_ultra_ball) {
                addCatchingLog(`${data.data.player_name} usou Ultra Ball e capturou ${data.data.pokemon_name}! 🟣`, 'success');
            } else {
                addCatchingLog(`${data.data.player_name} capturou ${data.data.pokemon_name}! 🎉`, 'success');
            }
            
            // Show toast for the catcher
            if (isMyAttempt) {
                if (data.data.team_full) {
                    showToast(`Time cheio! Recebeu R$2!`, 'info');
                } else {
                    showToast(`Você capturou ${data.data.pokemon_name}!`, 'success');
                }
            }
        } else {
            addCatchingLog(`${data.data.player_name} tirou ${data.data.dice_roll + 1} - ${data.data.pokemon_name} escapou!`, 'miss');
            
            // Show toast for the catcher
            if (isMyAttempt) {
                showToast(`${data.data.pokemon_name} escapou!`, 'warning');
            }
        }
        
        // If this was the last Pokemon, add extra delay before state refresh
        if (data.data.is_last_pokemon && data.data.caught) {
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        // Animation complete, allow state refreshes again
        GameState.catchAnimationInProgress = false;
        
        // Refresh state after animation completes
        refreshCatchingState();
    });
    
    GameState.eventSource.addEventListener('attack', (e) => {
        const data = JSON.parse(e.data);
        const effectText = data.data.type_multiplier > 1 ? ' (Super Efetivo!)' : 
                          (data.data.type_multiplier < 1 ? ' (Pouco Efetivo...)' : '');
        addCatchingLog(`${data.data.attacker_name} causou ${data.data.damage} de dano!${effectText}`, 'attack');
        
        if (data.data.defeated) {
            addCatchingLog(`${data.data.target_name} fugiu!`, 'fled');
        }
        if (data.data.evolved) {
            addCatchingLog(`${data.data.evolved.from} evoluiu para ${data.data.evolved.to}! 🌟`, 'evolution');
        }
        refreshCatchingState();
    });
    
    GameState.eventSource.addEventListener('turn_changed', (e) => {
        const data = JSON.parse(e.data);
        // Only refresh if we're not in the middle of a catch animation
        if (!GameState.catchAnimationInProgress) {
            refreshCatchingState();
        }
    });
    
    // Handle active Pokémon switch - refresh UI for all players
    GameState.eventSource.addEventListener('pokemon_switched', (e) => {
        const data = JSON.parse(e.data);
        const playerName = GameState.players.find(p => p.id == data.data.player_id)?.player_name || 'Um jogador';
        showToast(`${playerName} trocou para ${data.data.pokemon_name}!`, 'info');
        refreshCatchingState();
    });
    
    // Town Phase Events
    GameState.eventSource.addEventListener('town_purchase', (e) => {
        const data = JSON.parse(e.data);
        handleTownEvent('town_purchase', data.data);
    });
    
    GameState.eventSource.addEventListener('town_sell', (e) => {
        const data = JSON.parse(e.data);
        handleTownEvent('town_sell', data.data);
    });
    
    GameState.eventSource.addEventListener('town_ready_toggle', (e) => {
        const data = JSON.parse(e.data);
        handleTownEvent('town_ready_toggle', data.data);
    });
    
    GameState.eventSource.addEventListener('town_phase_change', (e) => {
        const data = JSON.parse(e.data);
        handleTownEvent('town_phase_change', data.data);
    });
    
    GameState.eventSource.addEventListener('town_switch_active', (e) => {
        const data = JSON.parse(e.data);
        handleTownEvent('town_switch_active', data.data);
    });
    
    // Tournament Phase Events
    GameState.eventSource.addEventListener('battle_started', (e) => {
        console.log('SSE battle_started raw:', e.data);
        const data = JSON.parse(e.data);
        console.log('SSE battle_started parsed:', data);
        handleTournamentEvent('battle_started', data.data || data);
    });
    
    GameState.eventSource.addEventListener('match_completed', (e) => {
        const data = JSON.parse(e.data);
        handleTournamentEvent('match_completed', data.data);
    });
    
    GameState.eventSource.addEventListener('tournament_updated', (e) => {
        const data = JSON.parse(e.data);
        handleTournamentEvent('tournament_updated', data.data);
    });
    
    GameState.eventSource.addEventListener('game_finished', (e) => {
        const data = JSON.parse(e.data);
        handleTournamentEvent('game_finished', data.data);
    });
    
    GameState.eventSource.addEventListener('tiebreaker_tournament', (e) => {
        const data = JSON.parse(e.data);
        const reason = data.data.reason;
        const players = data.data.players || [];
        const playerNames = players.map(p => p.name).join(', ');
        
        if (reason === 'badges_draw') {
            showToast(`🔥 DESEMPATE! ${playerNames} empataram com 5 insígnias! Eles devem batalhar!`, 'warning');
        } else if (reason === 'final_draw') {
            showToast(`🔥 DESEMPATE FINAL! ${playerNames} empataram com mais insígnias!`, 'warning');
        }
        
        // Refresh tournament state to show tiebreaker
        refreshTournamentState();
    });
    
    GameState.eventSource.addEventListener('tiebreaker_round', (e) => {
        const data = JSON.parse(e.data);
        showToast(`⚔️ Rodada de Desempate ${data.data.round}! ${data.data.remaining_players} jogadores restantes!`, 'info');
        refreshTournamentState();
    });

    // Ranked Mode Events
    GameState.eventSource.addEventListener('all_battles_started', (e) => {
        const data = JSON.parse(e.data);
        handleTournamentEvent('all_battles_started', data.data);
    });
    
    GameState.eventSource.addEventListener('ranked_all_battles_complete', (e) => {
        const data = JSON.parse(e.data);
        handleTournamentEvent('ranked_all_battles_complete', data.data);
    });
    
    GameState.eventSource.addEventListener('ranked_battle_attack', (e) => {
        const data = JSON.parse(e.data);
        handleRankedBattleEvent('attack', data.data);
    });
    
    GameState.eventSource.addEventListener('ranked_battle_ended', (e) => {
        const data = JSON.parse(e.data);
        handleRankedBattleEvent('battle_ended', data.data);
    });
    
    GameState.eventSource.addEventListener('ranked_pokemon_selected', (e) => {
        const data = JSON.parse(e.data);
        handleRankedBattleEvent('pokemon_selected', data.data);
    });
    
    GameState.eventSource.addEventListener('ranked_combat_started', (e) => {
        const data = JSON.parse(e.data);
        handleRankedBattleEvent('combat_started', data.data);
    });
    
    GameState.eventSource.addEventListener('ranked_pokemon_fainted', (e) => {
        const data = JSON.parse(e.data);
        handleRankedBattleEvent('pokemon_fainted', data.data);
    });
    
    GameState.eventSource.addEventListener('ranked_pokemon_sent', (e) => {
        const data = JSON.parse(e.data);
        handleRankedBattleEvent('pokemon_sent', data.data);
    });

    // Battle Phase Events
    GameState.eventSource.addEventListener('battle_pokemon_selected', (e) => {
        const data = JSON.parse(e.data);
        handleBattleEvent('pokemon_selected', data.data);
    });
    
    GameState.eventSource.addEventListener('battle_started_combat', (e) => {
        const data = JSON.parse(e.data);
        handleBattleEvent('combat_started', data.data);
    });
    
    GameState.eventSource.addEventListener('battle_attack', (e) => {
        const data = JSON.parse(e.data);
        handleBattleEvent('attack', data.data);
    });
    
    GameState.eventSource.addEventListener('battle_pokemon_fainted', (e) => {
        const data = JSON.parse(e.data);
        handleBattleEvent('pokemon_fainted', data.data);
    });
    
    GameState.eventSource.addEventListener('battle_pokemon_sent', (e) => {
        const data = JSON.parse(e.data);
        handleBattleEvent('pokemon_sent', data.data);
    });
    
    GameState.eventSource.addEventListener('battle_ended', (e) => {
        const data = JSON.parse(e.data);
        handleBattleEvent('battle_ended', data.data);
    });
    
    GameState.eventSource.addEventListener('reconnect', (e) => {
        console.log('SSE reconnect requested');
        connectSSE();
    });
}

/**
 * Disconnect SSE
 */
function disconnectSSE() {
    if (GameState.eventSource) {
        GameState.eventSource.close();
        GameState.eventSource = null;
    }
}

/**
 * Connect to WebSocket server
 * Falls back to SSE if WebSocket is disabled or fails
 */
function connectWebSocket() {
    // Check if WebSocket is enabled
    if (!WS_CONFIG.enabled) {
        console.log('[WS] WebSocket disabled, using SSE fallback');
        connectSSE();
        return;
    }
    
    // Close existing connections
    disconnectWebSocket();
    disconnectSSE();
    
    const wsUrl = `${WS_CONFIG.url}/?room_code=${GameState.roomCode}&player_id=${GameState.playerId}`;
    console.log('[WS] Connecting to:', wsUrl);
    
    try {
        GameState.webSocket = new WebSocket(wsUrl);
        
        GameState.webSocket.onopen = () => {
            console.log('[WS] Connected!');
            GameState.wsReconnectAttempts = 0;
        };
        
        GameState.webSocket.onclose = (event) => {
            console.log('[WS] Disconnected:', event.code, event.reason);
            GameState.webSocket = null;
            
            // Attempt to reconnect if we're still in a room
            if (GameState.roomCode && GameState.wsReconnectAttempts < WS_CONFIG.maxReconnectAttempts) {
                GameState.wsReconnectAttempts++;
                console.log(`[WS] Reconnecting in ${WS_CONFIG.reconnectDelay}ms (attempt ${GameState.wsReconnectAttempts})`);
                setTimeout(() => {
                    if (GameState.roomCode) {
                        connectWebSocket();
                    }
                }, WS_CONFIG.reconnectDelay);
            } else if (GameState.wsReconnectAttempts >= WS_CONFIG.maxReconnectAttempts) {
                console.log('[WS] Max reconnect attempts reached, falling back to SSE');
                connectSSE();
            }
        };
        
        GameState.webSocket.onerror = (error) => {
            console.error('[WS] Error:', error);
            // onclose will be called after this
        };
        
        GameState.webSocket.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                handleWebSocketMessage(message);
            } catch (e) {
                console.error('[WS] Failed to parse message:', e);
            }
        };
        
    } catch (error) {
        console.error('[WS] Failed to create WebSocket:', error);
        console.log('[WS] Falling back to SSE');
        connectSSE();
    }
}

/**
 * Disconnect WebSocket
 */
function disconnectWebSocket() {
    if (GameState.webSocket) {
        GameState.webSocket.close();
        GameState.webSocket = null;
    }
    GameState.wsReconnectAttempts = 0;
}

/**
 * Handle incoming WebSocket messages
 * Routes messages to the same handlers used by SSE
 */
function handleWebSocketMessage(message) {
    const { event: eventType, data: eventData, timestamp } = message;
    
    console.log('[WS] Received:', eventType, eventData);
    
    // Create a synthetic event data structure matching SSE format
    const syntheticData = {
        type: eventType,
        data: eventData,
        timestamp: timestamp
    };
    
    // Route to appropriate handler based on event type
    switch (eventType) {
        case 'connected':
            console.log('[WS] Connection confirmed');
            break;
            
        case 'player_joined':
            showToast(`${eventData.player_name} entrou!`, 'info');
            refreshRoomState();
            break;
            
        case 'player_left':
            showToast(`${eventData.player_name} saiu`, 'info');
            refreshRoomState();
            break;
            
        case 'player_ready':
        case 'player_updated':
            refreshRoomState();
            break;
            
        case 'game_started':
            if (eventData.first_picker_name) {
                showToast(`Jogo iniciado! ${eventData.first_picker_name} escolhe primeiro!`, 'success');
            } else {
                showToast('Jogo iniciado!', 'success');
            }
            refreshRoomState();
            break;
            
        case 'starter_selected':
            const playerName = GameState.players.find(p => p.id == eventData.player_id)?.player_name || 'Um jogador';
            showToast(`${playerName} escolheu ${eventData.pokemon_name}!`, 'info');
            // Always refresh - handles race conditions where event arrives before screen transition
            refreshSelectionState();
            break;
            
        case 'phase_changed':
            if (eventData.new_phase === 'catching' && eventData.first_player_name) {
                showToast(`Indo para fase de captura! ${eventData.first_player_name} começa!`, 'success');
            } else {
                const phaseNames = {
                    'catching': 'captura',
                    'town': 'cidade',
                    'tournament': 'torneio',
                    'battle': 'batalha',
                    'finished': 'fim'
                };
                const phaseName = phaseNames[eventData.new_phase] || eventData.new_phase;
                showToast(`Indo para fase de ${phaseName}!`, 'success');
            }
            handleGameStateChange(eventData.new_phase);
            break;
            
        case 'state_sync':
            handleGameStateChange(eventData.game_state);
            break;
            
        // Catching phase events
        case 'wild_pokemon_appeared':
            addCatchingLog(`Um ${eventData.pokemon_name} selvagem apareceu!`, 'wild');
            if (!GameState.catchAnimationInProgress) {
                refreshCatchingState();
            }
            break;
            
        case 'catch_attempt':
            handleCatchAttemptEvent(eventData);
            break;
            
        case 'attack':
            const effectText = eventData.type_multiplier > 1 ? ' (Super Efetivo!)' : 
                              (eventData.type_multiplier < 1 ? ' (Pouco Efetivo...)' : '');
            addCatchingLog(`${eventData.attacker_name} causou ${eventData.damage} de dano!${effectText}`, 'attack');
            if (eventData.defeated) {
                addCatchingLog(`${eventData.target_name} fugiu!`, 'fled');
            }
            if (eventData.evolved) {
                addCatchingLog(`${eventData.evolved.from} evoluiu para ${eventData.evolved.to}! 🌟`, 'evolution');
            }
            refreshCatchingState();
            break;
            
        case 'turn_changed':
            if (!GameState.catchAnimationInProgress) {
                refreshCatchingState();
            }
            break;
            
        case 'pokemon_switched':
            const switchPlayerName = GameState.players.find(p => p.id == eventData.player_id)?.player_name || 'Um jogador';
            showToast(`${switchPlayerName} trocou para ${eventData.pokemon_name}!`, 'info');
            refreshCatchingState();
            break;
            
        // Town Phase Events
        case 'town_purchase':
        case 'town_sell':
        case 'town_ready_toggle':
        case 'town_switch_active':
            // Always handle town events - don't gate on currentScreen
            // because the screen might not have transitioned yet
            handleTownEvent(eventType, eventData);
            break;
            
        case 'town_phase_change':
            handleTownEvent('town_phase_change', eventData);
            break;
            
        // Tournament/Battle Events
        case 'battle_started':
            console.log('[WS] battle_started:', eventData);
            handleTournamentEvent('battle_started', eventData);
            break;
            
        case 'match_completed':
            handleTournamentEvent('match_completed', eventData);
            break;
            
        case 'tournament_updated':
            // Always handle tournament updates regardless of current screen
            handleTournamentEvent('tournament_updated', eventData);
            break;
            
        case 'game_finished':
            handleTournamentEvent('game_finished', eventData);
            break;
            
        case 'tiebreaker_tournament':
            const reason = eventData.reason;
            const players = eventData.players || [];
            const tiePlayerNames = players.map(p => p.name).join(', ');
            if (reason === 'badges_draw') {
                showToast(`🔥 DESEMPATE! ${tiePlayerNames} empataram com 5 insígnias!`, 'warning');
            } else if (reason === 'final_draw') {
                showToast(`🔥 DESEMPATE FINAL! ${tiePlayerNames} empataram!`, 'warning');
            }
            refreshTournamentState();
            break;
            
        case 'tiebreaker_round':
            showToast(`⚔️ Rodada de Desempate ${eventData.round}!`, 'info');
            refreshTournamentState();
            break;
            
        // Battle Phase Events
        case 'battle_pokemon_selected':
            handleBattleEvent('pokemon_selected', eventData);
            break;
            
        case 'battle_started_combat':
            handleBattleEvent('combat_started', eventData);
            break;
            
        case 'battle_attack':
            handleBattleEvent('attack', eventData);
            break;
            
        case 'battle_pokemon_fainted':
            handleBattleEvent('pokemon_fainted', eventData);
            break;
            
        case 'battle_pokemon_sent':
            handleBattleEvent('pokemon_sent', eventData);
            break;
            
        case 'battle_ended':
            handleBattleEvent('battle_ended', eventData);
            break;
        
        // Ranked Mode Events
        case 'all_battles_started':
            handleTournamentEvent('all_battles_started', eventData);
            break;
        
        case 'ranked_all_battles_complete':
            handleTournamentEvent('ranked_all_battles_complete', eventData);
            break;
        
        case 'ranked_battle_attack':
            handleRankedBattleEvent('attack', eventData);
            break;
        
        case 'ranked_battle_ended':
            handleRankedBattleEvent('battle_ended', eventData);
            break;
        
        case 'ranked_pokemon_selected':
            handleRankedBattleEvent('pokemon_selected', eventData);
            break;
        
        case 'ranked_combat_started':
            handleRankedBattleEvent('combat_started', eventData);
            break;
        
        case 'ranked_pokemon_fainted':
            handleRankedBattleEvent('pokemon_fainted', eventData);
            break;
        
        case 'ranked_pokemon_sent':
            handleRankedBattleEvent('pokemon_sent', eventData);
            break;
            
        case 'pong':
            // Heartbeat response, ignore
            break;
            
        default:
            console.log('[WS] Unhandled event type:', eventType);
    }
}

/**
 * Handle catch attempt event (shared between SSE and WebSocket)
 */
async function handleCatchAttemptEvent(eventData) {
    const isMyAttempt = eventData.player_id == GameState.playerId;
    
    // Block state refreshes during animation
    GameState.catchAnimationInProgress = true;
    
    // Show dice animation for all players
    await showInlineDiceAnimation(
        eventData.dice_roll,
        eventData.caught,
        eventData.used_ultra_ball
    );
    
    // Log the result
    if (eventData.caught) {
        if (eventData.team_full) {
            addCatchingLog(`${eventData.player_name} capturou ${eventData.pokemon_name} mas o time está cheio! Recebeu R$2.`, 'success');
        } else if (eventData.used_ultra_ball) {
            addCatchingLog(`${eventData.player_name} usou Ultra Ball e capturou ${eventData.pokemon_name}! 🟣`, 'success');
        } else {
            addCatchingLog(`${eventData.player_name} capturou ${eventData.pokemon_name}! 🎉`, 'success');
        }
        
        if (isMyAttempt) {
            if (eventData.team_full) {
                showToast(`Time cheio! Recebeu R$2!`, 'info');
            } else {
                showToast(`Você capturou ${eventData.pokemon_name}!`, 'success');
            }
        }
    } else {
        addCatchingLog(`${eventData.player_name} tirou ${eventData.dice_roll + 1} - ${eventData.pokemon_name} escapou!`, 'miss');
        
        if (isMyAttempt) {
            showToast(`${eventData.pokemon_name} escapou!`, 'warning');
        }
    }
    
    // If this was the last Pokemon, add extra delay
    if (eventData.is_last_pokemon && eventData.caught) {
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // Animation complete
    GameState.catchAnimationInProgress = false;
    refreshCatchingState();
}

/**
 * Connect to real-time updates (WebSocket with SSE fallback)
 */
function connectRealtime() {
    if (WS_CONFIG.enabled) {
        connectWebSocket();
    } else {
        connectSSE();
    }
}

/**
 * Disconnect from real-time updates
 */
function disconnectRealtime() {
    disconnectWebSocket();
    disconnectSSE();
}

/**
 * Handle game state changes
 */
function handleGameStateChange(newState) {
    // Map game states to expected screens
    const stateToScreen = {
        'lobby': 'lobby',
        'initial': 'initial',
        'catching': 'catching',
        'town': 'town',
        'tournament': 'tournament',
        'battle': 'battle',
        'finished': 'victory'
    };
    
    const expectedScreen = stateToScreen[newState];
    const alreadyOnCorrectScreen = expectedScreen && GameState.currentScreen === expectedScreen;
    
    // Skip if we're already in this state AND on the correct screen
    // (unless we're in lobby, where we always re-process to handle game_started)
    if (newState === GameState.gameState && alreadyOnCorrectScreen && newState !== 'lobby') return;
    
    console.log(`[StateChange] ${GameState.gameState} → ${newState} (screen: ${GameState.currentScreen} → ${expectedScreen})`);
    
    GameState.gameState = newState;
    
    switch (newState) {
        case 'lobby':
            stopCatchingTimer();
            stopTownTimer();
            stopInitialSelectionTimer();
            if (GameState.currentScreen !== 'lobby') {
                switchScreen('lobby');
            }
            break;
        case 'initial':
            stopCatchingTimer();
            stopTownTimer();
            switchScreen('initial');
            loadStarterPokemon();
            startSelectionPolling();
            break;
        case 'catching':
            stopSelectionPolling();
            stopTownTimer();
            stopInitialSelectionTimer();
            switchScreen('catching');
            initCatchingPhase();
            break;
        case 'town':
            stopCatchingTimer();
            stopInitialSelectionTimer();
            switchScreen('town');
            initTownPhase();
            break;
        case 'tournament':
            stopCatchingTimer();
            stopTownTimer();
            stopInitialSelectionTimer();
            switchScreen('tournament');
            initTournamentPhase();
            break;
        case 'battle':
            stopCatchingTimer();
            stopTownTimer();
            stopInitialSelectionTimer();
            switchScreen('battle');
            initBattlePhase();
            break;
        case 'finished':
            stopSelectionPolling();
            stopGameStateWatchdog();
            stopCatchingTimer();
            stopTownTimer();
            stopInitialSelectionTimer();
            switchScreen('victory');
            loadVictoryScreen();
            break;
    }
}

/**
 * Load starter Pokemon options
 */
async function loadStarterPokemon() {
    DOM.starterGrid.innerHTML = '<p>Carregando iniciais...</p>';
    DOM.initialTurnIndicator.textContent = 'Carregando...';
    
    try {
        // Load available starters (pass room_code for dynamic starter count)
        const startersResult = await apiCall(`${API.pokemon}?action=get_starters&room_code=${GameState.roomCode}`, {}, 'GET');
        
        if (!startersResult.success) {
            showToast('Falha ao carregar iniciais', 'error');
            return;
        }
        
        console.log(`Loaded ${startersResult.starters.length} starters for ${startersResult.player_count} players`);
        
        // Load current selection state
        const stateResult = await apiCall(`${API.pokemon}?action=get_selection_state&room_code=${GameState.roomCode}`, {}, 'GET');
        
        if (!stateResult.success) {
            showToast('Falha ao carregar estado de seleção', 'error');
            return;
        }
        
        // Store starters in game state
        GameState.starters = startersResult.starters;
        GameState.selectionState = stateResult;
        
        // Render the UI
        renderStarterSelection();
        
    } catch (error) {
        console.error('Error loading starters:', error);
        showToast('Erro ao carregar Pokémon iniciais', 'error');
    }
}

/**
 * Render starter selection UI
 */
function renderStarterSelection() {
    const starters = GameState.starters || [];
    const state = GameState.selectionState || {};
    const players = state.players || [];
    const currentTurn = parseInt(state.current_turn ?? 0);
    const isMyTurn = GameState.playerNumber == currentTurn;
    
    // Find which Pokemon have been selected
    const selectedPokemonIds = players
        .filter(p => p.pokemon_id)
        .map(p => parseInt(p.pokemon_id));
    
    // Update turn indicator
    const currentPlayer = players.find(p => p.player_number === currentTurn);
    if (isMyTurn) {
        DOM.initialTurnIndicator.textContent = '🎯 Sua vez! Escolha seu Pokémon inicial!';
        DOM.initialTurnIndicator.style.color = '#4ade80';
        // Start the countdown timer only if it's not already running
        if (!GameState.initialSelectionTimerInterval) {
            startInitialSelectionTimer();
        }
    } else {
        if (currentPlayer) {
            DOM.initialTurnIndicator.textContent = `Aguardando ${currentPlayer.player_name} escolher...`;
            DOM.initialTurnIndicator.style.color = '#fbbf24';
        }
        stopInitialSelectionTimer();
    }
    
    // Render starter grid
    DOM.starterGrid.innerHTML = '';
    starters.forEach(pokemon => {
        const isSelected = selectedPokemonIds.includes(pokemon.id);
        const card = createPokemonCard(pokemon, isSelected, isMyTurn && !isSelected);
        
        if (isMyTurn && !isSelected) {
            card.addEventListener('click', () => selectStarter(pokemon.id));
        }
        
        DOM.starterGrid.appendChild(card);
    });
    
    // Render selected list
    renderSelectedList(players);
}

/**
 * Create a Pokemon card element
 */
function createPokemonCard(pokemon, isSelected = false, isClickable = false) {
    const card = document.createElement('div');
    card.className = 'pokemon-card';
    if (isSelected) card.classList.add('disabled');
    if (isClickable) card.classList.add('clickable');
    
    card.innerHTML = `
        <div class="pokemon-sprite">
            <img src="${pokemon.sprite_url}" alt="${pokemon.name}" 
                 onerror="this.src='https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/0.png'">
        </div>
        <div class="pokemon-name">${pokemon.name}</div>
        <div class="pokemon-types">
            <span class="type-badge ${pokemon.type_defense}">${pokemon.type_defense}</span>
            ${pokemon.type_attack !== pokemon.type_defense ? 
                `<span class="type-badge ${pokemon.type_attack}">${pokemon.type_attack}</span>` : ''}
        </div>
        <div class="pokemon-stats">
            <div class="stat">
                <span class="stat-label">HP</span>
                <span class="stat-value">${pokemon.base_hp}</span>
            </div>
            <div class="stat">
                <span class="stat-label">ATK</span>
                <span class="stat-value">${pokemon.base_attack}</span>
            </div>
            <div class="stat">
                <span class="stat-label">SPD</span>
                <span class="stat-value">${pokemon.base_speed}</span>
            </div>
        </div>
        ${isSelected ? '<div class="selected-overlay">ESCOLHIDO</div>' : ''}
    `;
    
    return card;
}

/**
 * Render the list of players and their selections
 */
function renderSelectedList(players) {
    DOM.selectedList.innerHTML = '';
    
    players.forEach(player => {
        const item = document.createElement('div');
        item.className = 'selected-item';
        
        const avatarEmoji = AVATARS[player.avatar_id - 1] || '😎';
        const isMe = player.id == GameState.playerId;
        
        if (player.pokemon_name) {
            item.innerHTML = `
                <div class="mini-avatar">${avatarEmoji}</div>
                <span class="${isMe ? 'is-you' : ''}">${escapeHtml(player.player_name)}</span>
                <span>→</span>
                <img src="${player.sprite_url}" alt="${player.pokemon_name}" 
                     style="width: 32px; height: 32px;"
                     onerror="this.style.display='none'">
                <span>${player.pokemon_name}</span>
            `;
        } else {
            item.innerHTML = `
                <div class="mini-avatar">${avatarEmoji}</div>
                <span class="${isMe ? 'is-you' : ''}">${escapeHtml(player.player_name)}</span>
                <span class="waiting">Aguardando...</span>
            `;
        }
        
        DOM.selectedList.appendChild(item);
    });
}

/**
 * Select a starter Pokemon
 */
async function selectStarter(pokemonId) {
    // Stop the countdown immediately so we don't auto-select after clicking
    stopInitialSelectionTimer();
    setLoading(true);
    
    try {
        const result = await apiCall(API.pokemon, {
            action: 'select_starter',
            pokemon_id: pokemonId
        });
        
        if (result.success) {
            showToast(`Você escolheu ${result.pokemon.name}!`, 'success');
            
            if (result.phase_complete) {
                showToast('Todos os jogadores escolheram! Iniciando fase de captura...', 'info');
                // Transition directly — don't rely solely on WS/SSE event
                // The WS/SSE event may also arrive, but handleGameStateChange
                // will ignore it if we're already on the catching screen
                setTimeout(() => {
                    handleGameStateChange('catching');
                }, 1500);
            } else {
                // Refresh selection state
                await refreshSelectionState();
            }
        } else {
            showToast(result.error || 'Falha ao selecionar inicial', 'error');
        }
    } catch (error) {
        console.error('Error selecting starter:', error);
        showToast('Erro ao selecionar inicial', 'error');
    }
    
    setLoading(false);
}

/**
 * Refresh selection state
 */
async function refreshSelectionState() {
    try {
        const result = await apiCall(`${API.pokemon}?action=get_selection_state&room_code=${GameState.roomCode}`, {}, 'GET');
        
        if (result.success) {
            // Check if game state has changed (e.g., initial → catching)
            // This handles the case where a WS/SSE phase_changed event was missed
            if (result.game_state && result.game_state !== 'initial') {
                console.log(`Selection polling detected phase change to: ${result.game_state}`);
                handleGameStateChange(result.game_state);
                return;
            }
            
            GameState.selectionState = result;
            // Only render if starters have been loaded
            if (GameState.starters) {
                renderStarterSelection();
            }
        }
    } catch (error) {
        console.error('Error refreshing selection state:', error);
    }
}

/**
 * Start polling for selection state updates (fallback for missed WS events)
 */
function startSelectionPolling() {
    stopSelectionPolling();
    GameState.selectionPollInterval = setInterval(() => {
        if (GameState.currentScreen === 'initial') {
            refreshSelectionState();
        } else {
            stopSelectionPolling();
        }
    }, 3000);
}

/**
 * Stop selection phase polling
 */
function stopSelectionPolling() {
    if (GameState.selectionPollInterval) {
        clearInterval(GameState.selectionPollInterval);
        GameState.selectionPollInterval = null;
    }
}

/**
 * Start a general-purpose game state watchdog.
 * Periodically checks the server's current game_state and triggers
 * phase transitions if a WS/SSE event was missed.
 * This is a safety net — real-time events should handle most transitions.
 */
function startGameStateWatchdog() {
    stopGameStateWatchdog();
    GameState.gameStateWatchdogInterval = setInterval(async () => {
        // Only run if we're in an active game
        if (!GameState.roomCode) {
            stopGameStateWatchdog();
            return;
        }
        
        try {
            const result = await apiCall(`${API.room}?action=get_room&room_code=${GameState.roomCode}`, {}, 'GET');
            if (result.success && result.room) {
                const serverState = result.room.game_state;
                // If the server's game state differs from ours, transition
                if (serverState && serverState !== GameState.gameState) {
                    console.log(`[Watchdog] Detected state mismatch: local=${GameState.gameState}, server=${serverState}. Transitioning...`);
                    GameState.players = result.players || GameState.players;
                    handleGameStateChange(serverState);
                }
            }
        } catch (error) {
            // Silently ignore — this is a background safety check
            console.debug('[Watchdog] Poll error:', error);
        }
    }, 5000); // Check every 5 seconds
}

/**
 * Stop the game state watchdog
 */
function stopGameStateWatchdog() {
    if (GameState.gameStateWatchdogInterval) {
        clearInterval(GameState.gameStateWatchdogInterval);
        GameState.gameStateWatchdogInterval = null;
    }
}

// ============================================
// COUNTDOWN TIMER FUNCTIONS
// ============================================

/**
 * Start the catching phase countdown timer (5 seconds per turn).
 * Only runs on the current player's client. Auto-catches if time runs out.
 */
function startCatchingTimer() {
    stopCatchingTimer();
    
    // Only start the timer if it's our turn and there's a wild Pokemon
    if (!GameState.isMyTurn || !GameState.wildPokemon) return;
    
    GameState.catchingTimerSeconds = 5;
    
    const timerEl = document.getElementById('catching-countdown');
    const timerValueEl = document.getElementById('catching-timer-value');
    if (!timerEl || !timerValueEl) return;
    
    // Show timer and set initial value
    timerEl.classList.remove('hidden', 'timer-warning', 'timer-critical');
    timerValueEl.textContent = GameState.catchingTimerSeconds;
    
    GameState.catchingTimerInterval = setInterval(() => {
        GameState.catchingTimerSeconds--;
        timerValueEl.textContent = Math.max(0, GameState.catchingTimerSeconds);
        
        // Visual urgency
        if (GameState.catchingTimerSeconds <= 2) {
            timerEl.classList.remove('timer-warning');
            timerEl.classList.add('timer-critical');
        } else if (GameState.catchingTimerSeconds <= 3) {
            timerEl.classList.add('timer-warning');
        }
        
        // Time's up — auto-catch
        if (GameState.catchingTimerSeconds <= 0) {
            stopCatchingTimer();
            console.log('[Timer] Catching timer expired — auto-catching');
            // Only auto-catch if it's still our turn and there's a wild Pokemon
            if (GameState.isMyTurn && GameState.wildPokemon && !GameState.catchAnimationInProgress) {
                attemptCatch(false);
            }
        }
    }, 1000);
}

/**
 * Stop the catching phase countdown timer and hide the display.
 */
function stopCatchingTimer() {
    if (GameState.catchingTimerInterval) {
        clearInterval(GameState.catchingTimerInterval);
        GameState.catchingTimerInterval = null;
    }
    GameState.catchingTimerSeconds = 0;
    
    const timerEl = document.getElementById('catching-countdown');
    if (timerEl) {
        timerEl.classList.add('hidden');
        timerEl.classList.remove('timer-warning', 'timer-critical');
    }
}

// ============================================
// INITIAL SELECTION TIMER (deadline-based)
// ============================================

/**
 * Start a 10-second countdown for the initial Pokémon selection.
 * Uses an absolute deadline so the timer stays accurate even when the
 * browser throttles setInterval (e.g. when the tab is in the background).
 */
function startInitialSelectionTimer() {
    stopInitialSelectionTimer();

    GameState.initialSelectionDeadline = Date.now() + 10000; // 10 s from now

    // Immediately render the first frame
    tickInitialSelectionTimer();

    // Tick every 250 ms for a responsive display
    GameState.initialSelectionTimerInterval = setInterval(() => {
        tickInitialSelectionTimer();
    }, 250);
}

/**
 * Single tick of the initial-selection timer – computes remaining time from deadline.
 */
function tickInitialSelectionTimer() {
    if (!GameState.initialSelectionDeadline) return;

    const remaining = Math.max(0, GameState.initialSelectionDeadline - Date.now());
    const secondsLeft = Math.ceil(remaining / 1000);

    // Update visual display
    const timerEl = document.getElementById('initial-countdown');
    const timerValueEl = document.getElementById('initial-timer-value');
    if (timerEl && timerValueEl) {
        timerEl.classList.remove('hidden', 'timer-warning', 'timer-critical');
        timerValueEl.textContent = Math.max(0, secondsLeft);

        if (secondsLeft <= 3) {
            timerEl.classList.remove('timer-warning');
            timerEl.classList.add('timer-critical');
        } else if (secondsLeft <= 5) {
            timerEl.classList.remove('timer-critical');
            timerEl.classList.add('timer-warning');
        } else {
            timerEl.classList.remove('timer-warning', 'timer-critical');
        }
    }

    if (remaining <= 0) {
        stopInitialSelectionTimer();
        autoSelectStarter();
    }
}

/**
 * Stop the initial-selection countdown timer and hide the display.
 */
function stopInitialSelectionTimer() {
    if (GameState.initialSelectionTimerInterval) {
        clearInterval(GameState.initialSelectionTimerInterval);
        GameState.initialSelectionTimerInterval = null;
    }
    GameState.initialSelectionDeadline = null;

    const timerEl = document.getElementById('initial-countdown');
    if (timerEl) {
        timerEl.classList.add('hidden');
        timerEl.classList.remove('timer-warning', 'timer-critical');
    }
}

/**
 * Auto-select a random available starter when the timer expires.
 */
function autoSelectStarter() {
    console.log('[Timer] Initial selection timer expired — auto-selecting starter');

    const starters = GameState.starters || [];
    const state = GameState.selectionState || {};
    const players = state.players || [];

    // Get already-chosen Pokémon IDs
    const selectedPokemonIds = players
        .filter(p => p.pokemon_id)
        .map(p => parseInt(p.pokemon_id));

    // Available starters = not yet selected
    const available = starters.filter(s => !selectedPokemonIds.includes(s.id));
    if (available.length === 0) return;

    // Pick a random one
    const pick = available[Math.floor(Math.random() * available.length)];
    selectStarter(pick.id);
}

/**
 * Start the town phase countdown timer (60 seconds).
 * Runs on all clients. When it hits 0, the host auto-readies everyone.
 */
function startTownTimer() {
    stopTownTimer();
    
    GameState.townTimerSeconds = 60;
    
    const timerEl = document.getElementById('town-countdown');
    const timerValueEl = document.getElementById('town-timer-value');
    if (!timerEl || !timerValueEl) return;
    
    // Show timer and set initial value
    timerEl.classList.remove('hidden', 'timer-warning', 'timer-critical');
    timerValueEl.textContent = GameState.townTimerSeconds;
    
    GameState.townTimerInterval = setInterval(() => {
        GameState.townTimerSeconds--;
        timerValueEl.textContent = Math.max(0, GameState.townTimerSeconds);
        
        // Visual urgency
        if (GameState.townTimerSeconds <= 10) {
            timerEl.classList.remove('timer-warning');
            timerEl.classList.add('timer-critical');
        } else if (GameState.townTimerSeconds <= 20) {
            timerEl.classList.add('timer-warning');
        }
        
        // Time's up — auto-ready this player
        if (GameState.townTimerSeconds <= 0) {
            stopTownTimer();
            console.log('[Timer] Town timer expired — auto-readying');
            // If we're not already ready, toggle ready
            if (!TownState.isReady) {
                toggleTownReady();
            }
        }
    }, 1000);
}

/**
 * Stop the town phase countdown timer and hide the display.
 */
function stopTownTimer() {
    if (GameState.townTimerInterval) {
        clearInterval(GameState.townTimerInterval);
        GameState.townTimerInterval = null;
    }
    GameState.townTimerSeconds = 0;
    
    const timerEl = document.getElementById('town-countdown');
    if (timerEl) {
        timerEl.classList.add('hidden');
        timerEl.classList.remove('timer-warning', 'timer-critical');
    }
}

// ============================================
// CATCHING PHASE FUNCTIONS
// ============================================

/**
 * Initialize the catching phase
 */
async function initCatchingPhase() {
    console.log('Initializing catching phase...');
    
    // Clear log
    if (DOM.catchingLogMessages) {
        DOM.catchingLogMessages.innerHTML = '';
    }
    
    addCatchingLog('Bem-vindo à Fase de Captura!', 'system');
    
    // Load initial state
    await refreshCatchingState();
}

/**
 * Refresh catching phase state from server
 */
async function refreshCatchingState() {
    try {
        const result = await apiCall(`${API.catching}?action=get_state&room_code=${GameState.roomCode}`, {}, 'GET');
        
        if (result.success) {
            // Check if game state has changed (e.g., catching → town)
            // This handles the case where a WS/SSE phase_changed event was missed
            if (result.room.game_state && result.room.game_state !== 'catching') {
                console.log(`Catching state polling detected phase change to: ${result.room.game_state}`);
                handleGameStateChange(result.room.game_state);
                return;
            }
            
            GameState.catchingState = result;
            GameState.wildPokemon = result.wild_pokemon;
            GameState.currentRoute = result.room.current_route || 1;
            GameState.turnsPerPlayer = result.room.turns_per_player || 8;
            
            // Track my turns taken
            const myPlayer = result.players.find(p => p.id == GameState.playerId);
            GameState.myTurnsTaken = myPlayer?.turns_taken || 0;
            
            // Check if it's my turn
            GameState.isMyTurn = myPlayer && myPlayer.player_number == result.room.current_player_turn;
            
            // Update all UI elements
            renderCatchingUI(result);
            
            // Spawn wild Pokemon if needed and it's my turn and I'm first
            if (!result.wild_pokemon && GameState.isMyTurn && GameState.isHost) {
                await spawnWildPokemon();
            }
        } else {
            console.error('Failed to get catching state:', result.error);
        }
    } catch (error) {
        console.error('Error refreshing catching state:', error);
    }
}

/**
 * Render all catching phase UI elements
 */
function renderCatchingUI(data) {
    const room = data.room;
    const players = data.players;
    const wildPokemon = data.wild_pokemon;
    
    // Update route info
    if (DOM.routeName) {
        DOM.routeName.textContent = room.route_name || `Rota ${room.current_route}`;
    }
    if (DOM.encountersRemaining) {
        // Show current cycle / total turns per player
        const currentCycle = room.current_cycle || 1;
        const turnsPerPlayer = room.turns_per_player || 8;
        DOM.encountersRemaining.textContent = `Ciclo: ${currentCycle}/${turnsPerPlayer}`;
    }
    if (DOM.routeProgress) {
        DOM.routeProgress.textContent = `Rota ${room.current_route}/5`;
    }
    
    // Update wild Pokemon display
    renderWildPokemon(wildPokemon);
    
    // Update turn indicator
    renderTurnIndicator(players, room.current_player_turn);
    
    // Update action buttons
    updateActionButtons(wildPokemon);
    
    // Update players panel
    renderPlayersPanel(players, room.current_player_turn);
}

/**
 * Render wild Pokemon display
 */
function renderWildPokemon(pokemon) {
    if (!DOM.wildPokemonDisplay) return;
    
    if (pokemon) {
        DOM.wildPokemonDisplay.classList.remove('hidden');
        DOM.wildPokemonPlaceholder?.classList.add('hidden');
        
        if (DOM.wildPokemonImg) {
            DOM.wildPokemonImg.src = pokemon.sprite_url || 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/0.png';
            DOM.wildPokemonImg.alt = pokemon.name;
        }
        if (DOM.wildPokemonName) {
            DOM.wildPokemonName.textContent = pokemon.name;
        }
        
        // Defense type (always shown)
        if (DOM.wildPokemonTypeDef) {
            DOM.wildPokemonTypeDef.textContent = pokemon.type_defense;
            DOM.wildPokemonTypeDef.className = `type-badge ${pokemon.type_defense}`;
        }
        
        // Attack type (only shown if different from defense)
        if (DOM.wildPokemonTypeAtk) {
            if (pokemon.type_attack && pokemon.type_attack !== pokemon.type_defense) {
                DOM.wildPokemonTypeAtk.textContent = pokemon.type_attack;
                DOM.wildPokemonTypeAtk.className = `type-badge ${pokemon.type_attack}`;
                DOM.wildPokemonTypeAtk.classList.remove('hidden');
            } else {
                DOM.wildPokemonTypeAtk.classList.add('hidden');
            }
        }
        
        // Stats
        if (DOM.wildPokemonAtk) {
            DOM.wildPokemonAtk.textContent = pokemon.base_attack || '?';
        }
        if (DOM.wildPokemonSpd) {
            DOM.wildPokemonSpd.textContent = pokemon.base_speed || '?';
        }
        
        // Update HP bar
        const hpPercent = Math.max(0, (pokemon.current_hp / pokemon.max_hp) * 100);
        if (DOM.wildHpBar) {
            DOM.wildHpBar.style.width = `${hpPercent}%`;
            DOM.wildHpBar.className = 'hp-bar';
            if (hpPercent <= 25) {
                DOM.wildHpBar.classList.add('hp-low');
            } else if (hpPercent <= 50) {
                DOM.wildHpBar.classList.add('hp-medium');
            }
        }
        if (DOM.wildHpText) {
            DOM.wildHpText.textContent = `${pokemon.current_hp}/${pokemon.max_hp}`;
        }
        
        // Display catch rate
        if (DOM.wildCatchRate) {
            const catchRate = pokemon.catch_rate || 30;
            DOM.wildCatchRate.textContent = `${catchRate}%`;
            // Color-code: green if high, yellow if medium, red if low
            DOM.wildCatchRate.className = 'catch-rate-value';
            if (catchRate >= 60) {
                DOM.wildCatchRate.classList.add('catch-rate-high');
            } else if (catchRate >= 35) {
                DOM.wildCatchRate.classList.add('catch-rate-medium');
            } else {
                DOM.wildCatchRate.classList.add('catch-rate-low');
            }
        }
        if (DOM.wildCatchRateDisplay) {
            DOM.wildCatchRateDisplay.classList.remove('hidden');
        }
    } else {
        DOM.wildPokemonDisplay.classList.add('hidden');
        DOM.wildPokemonPlaceholder?.classList.remove('hidden');
        if (DOM.wildCatchRateDisplay) {
            DOM.wildCatchRateDisplay.classList.add('hidden');
        }
    }
}

/**
 * Render turn indicator
 */
function renderTurnIndicator(players, currentTurn) {
    const currentPlayer = players.find(p => p.player_number == currentTurn);
    
    if (DOM.currentTurnName && currentPlayer) {
        DOM.currentTurnName.textContent = currentPlayer.id == GameState.playerId 
            ? 'Sua' 
            : `Vez de ${currentPlayer.player_name}`;
    }
    
    if (DOM.catchingTurnIndicator) {
        if (GameState.isMyTurn) {
            DOM.catchingTurnIndicator.classList.add('your-turn');
        } else {
            DOM.catchingTurnIndicator.classList.remove('your-turn');
        }
    }
    
    // Start/stop the catching countdown timer based on whose turn it is
    if (GameState.isMyTurn && GameState.wildPokemon) {
        // Only restart the timer if it's not already running
        // (avoids resetting the timer on every state refresh within the same turn)
        if (!GameState.catchingTimerInterval) {
            startCatchingTimer();
        }
    } else {
        stopCatchingTimer();
    }
}

/**
 * Update action buttons state
 */
function updateActionButtons(wildPokemon) {
    const canAct = GameState.isMyTurn && wildPokemon;
    const actionButtonsContainer = document.getElementById('player-action-buttons');
    
    // Show/hide action buttons based on turn
    if (actionButtonsContainer) {
        if (GameState.isMyTurn) {
            actionButtonsContainer.classList.remove('hidden');
        } else {
            actionButtonsContainer.classList.add('hidden');
        }
    }
    
    if (DOM.btnCatch) {
        DOM.btnCatch.disabled = !canAct;
        // Update catch button text to show current catch rate
        const btnText = DOM.btnCatch.querySelector('.btn-text');
        if (btnText && wildPokemon) {
            const catchRate = wildPokemon.catch_rate || 30;
            btnText.textContent = `Capturar (${catchRate}%)`;
        } else if (btnText) {
            btnText.textContent = 'Capturar';
        }
    }
    if (DOM.btnUltraCatch) {
        // Check if player has ultra balls
        const myPlayer = GameState.catchingState?.players?.find(p => p.id == GameState.playerId);
        const ultraBalls = myPlayer?.ultra_balls || 0;
        DOM.btnUltraCatch.disabled = !canAct || ultraBalls <= 0;
        if (DOM.ultraBallCount) {
            DOM.ultraBallCount.textContent = `${ultraBalls}`;
        }
    }
    if (DOM.btnAttack) {
        // Check if player has an active Pokemon
        const myPlayer = GameState.catchingState?.players?.find(p => p.id == GameState.playerId);
        const hasActivePokemon = myPlayer?.active_pokemon;
        DOM.btnAttack.disabled = !canAct || !hasActivePokemon;
    }
}

/**
 * Render players panel with their Pokemon and status
 */
function renderPlayersPanel(players, currentTurn) {
    if (!DOM.catchingPlayersPanel) return;
    
    DOM.catchingPlayersPanel.innerHTML = '';
    
    players.forEach(player => {
        const card = document.createElement('div');
        card.className = 'catching-player-card';
        if (player.player_number == currentTurn) card.classList.add('active-turn');
        const isCurrentPlayer = player.id == GameState.playerId;
        if (isCurrentPlayer) card.classList.add('is-you');
        
        const avatarEmoji = AVATARS[player.avatar_id - 1] || '😎';
        const team = player.team || [];
        
        // Build team display - show all Pokemon sprites with EXP (only if they can evolve)
        let teamHtml = '';
        if (team.length > 0) {
            teamHtml = '<div class="player-team-grid">';
            team.forEach(pokemon => {
                const isActive = pokemon.is_active;
                const expDisplay = pokemon.current_exp || 0;
                const canClick = isCurrentPlayer;
                const canEvolve = pokemon.evolution_id != null;
                const expInfo = canEvolve ? ` | EXP: ${expDisplay}/5` : '';
                const statsTitle = `${pokemon.name}${isActive ? ' (Ativo)' : ''}\nHP: ${pokemon.base_hp} | ATQ: ${pokemon.base_attack} | VEL: ${pokemon.base_speed}${expInfo}`;
                teamHtml += `
                    <div class="team-pokemon-slot ${isActive ? 'active' : ''} ${canClick ? 'clickable' : ''}" 
                         title="${statsTitle}"
                         ${canClick ? `data-pokemon-id="${pokemon.id}"` : ''}>
                        <img src="${pokemon.sprite_url || ''}" alt="${pokemon.name}" class="team-pokemon-sprite" onerror="this.src='https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/0.png'">
                        ${canEvolve ? `<span class="pokemon-exp-badge">${expDisplay}</span>` : ''}
                    </div>
                `;
            });
            // Add empty slots
            for (let i = team.length; i < 6; i++) {
                teamHtml += '<div class="team-pokemon-slot empty"></div>';
            }
            teamHtml += '</div>';
        } else {
            teamHtml = '<div class="no-pokemon">Nenhum Pokémon ainda</div>';
        }
        
        const turnsTaken = player.turns_taken || 0;
        const turnsPerPlayer = GameState.turnsPerPlayer || 8;
        const turnsRemaining = Math.max(0, turnsPerPlayer - turnsTaken);
        
        card.innerHTML = `
            <div class="catching-player-header">
                <span class="player-avatar-mini">${avatarEmoji}</span>
                <span class="player-name">${escapeHtml(player.player_name)}</span>
                ${player.player_number == currentTurn ? '<span class="turn-badge">🎯</span>' : ''}
                <span class="turns-badge" title="Turnos restantes">🔄 ${turnsRemaining}</span>
            </div>
            ${teamHtml}
            <div class="catching-player-stats">
                <span class="stat-item" title="Insígnias">🎖️ ${player.badges || 0}</span>
                <span class="stat-item" title="Dinheiro">💰 R$${player.money || 0}</span>
                <span class="stat-item" title="Ultra Balls">◓ ${player.ultra_balls || 0}</span>
            </div>
        `;
        
        // Add click handlers for the current player's Pokemon (except the active one)
        if (isCurrentPlayer) {
            card.querySelectorAll('.team-pokemon-slot.clickable:not(.active)').forEach(slot => {
                slot.addEventListener('click', () => {
                    const pokemonId = slot.dataset.pokemonId;
                    if (pokemonId) {
                        setActivePokemon(pokemonId);
                    }
                });
            });
        }
        
        DOM.catchingPlayersPanel.appendChild(card);
    });
}

/**
 * Set a Pokemon as active
 */
async function setActivePokemon(pokemonId) {
    try {
        const result = await apiCall(API.catching, { 
            action: 'set_active',
            pokemon_id: pokemonId
        });
        
        if (result.success) {
            showToast(result.message, 'success');
            // Refresh the catching state to update the UI
            await refreshCatchingState();
        } else {
            showToast(result.error || 'Falha ao trocar Pokémon', 'error');
        }
    } catch (error) {
        console.error('Error setting active Pokemon:', error);
        showToast('Falha ao trocar Pokémon', 'error');
    }
}

/**
 * Spawn a wild Pokemon (called by first player/host when needed)
 */
async function spawnWildPokemon() {
    try {
        const result = await apiCall(API.catching, { action: 'spawn_wild' });
        
        if (result.success) {
            GameState.wildPokemon = result.pokemon;
            renderWildPokemon(result.pokemon);
        } else if (result.error !== 'Wild Pokemon already active') {
            console.error('Failed to spawn wild Pokemon:', result.error);
        }
    } catch (error) {
        console.error('Error spawning wild Pokemon:', error);
    }
}

/**
 * Attempt to catch the wild Pokemon
 */
async function attemptCatch(useUltraBall = false) {
    if (!GameState.isMyTurn || !GameState.wildPokemon) {
        showToast("Não é sua vez!", 'warning');
        return;
    }
    
    // Stop the countdown timer — player has acted
    stopCatchingTimer();
    
    setLoading(true);
    
    try {
        const result = await apiCall(API.catching, {
            action: 'catch',
            use_ultra_ball: useUltraBall ? 'true' : 'false'
        });
        
        if (result.success) {
            // Animation and state update handled via SSE for all players
            // Just store the result for potential last-pokemon delay handling
            GameState.lastCatchResult = result.result;
        } else {
            showToast(result.error || 'Falha na captura', 'error');
        }
    } catch (error) {
        console.error('Error attempting catch:', error);
        showToast('Erro ao tentar capturar', 'error');
    }
    
    setLoading(false);
}

/**
 * Show inline dice animation next to wild Pokemon (triggered via SSE for all players)
 * @param {number} finalValue - The final dice value (0-5)
 * @param {boolean} caught - Whether the catch was successful
 * @param {boolean} usedUltraBall - Whether an Ultra Ball was used
 */
async function showInlineDiceAnimation(finalValue, caught, usedUltraBall) {
    // If Ultra Ball was used, show special animation instead of dice
    if (usedUltraBall) {
        await showUltraBallAnimation();
        return;
    }
    
    const diceContainer = document.getElementById('catch-dice-animation');
    const diceFace = diceContainer?.querySelector('.dice-face');
    
    if (!diceContainer || !diceFace) return;
    
    // Reset state
    diceContainer.className = 'catch-dice';
    
    // Show dice
    diceContainer.classList.remove('hidden');
    
    // Dice face emojis for d6 (0-5 maps to ⚀-⚅)
    const diceFaces = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
    
    // Animate the dice rolling for 500ms (faster)
    const rollDuration = 500;
    const rollInterval = 50; // Change face every 50ms
    let elapsed = 0;
    
    await new Promise(resolve => {
        const rollTimer = setInterval(() => {
            elapsed += rollInterval;
            
            // Show random dice face
            const randomFace = diceFaces[Math.floor(Math.random() * 6)];
            diceFace.textContent = randomFace;
            
            if (elapsed >= rollDuration) {
                clearInterval(rollTimer);
                resolve();
            }
        }, rollInterval);
    });
    
    // Show final result
    diceFace.textContent = diceFaces[finalValue];
    diceContainer.classList.add('stopped');
    
    // Add success/fail animation class
    if (caught) {
        diceContainer.classList.add('success');
    } else {
        diceContainer.classList.add('fail');
    }
    
    // Keep showing result for a moment
    await new Promise(resolve => setTimeout(resolve, 600));
    
    // Hide dice after animation
    diceContainer.classList.add('hidden');
}

/**
 * Show Ultra Ball throw animation (guaranteed catch)
 */
async function showUltraBallAnimation() {
    const ultraBall = document.getElementById('ultra-ball-animation');
    
    if (!ultraBall) return;
    
    // Reset state
    ultraBall.classList.remove('active');
    ultraBall.classList.remove('hidden');
    
    // Trigger animation
    // Small delay to ensure CSS reset takes effect
    await new Promise(resolve => setTimeout(resolve, 10));
    ultraBall.classList.add('active');
    
    // Wait for animation to complete (1 second)
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Hide after animation
    ultraBall.classList.add('hidden');
    ultraBall.classList.remove('active');
}

/**
 * Attack the wild Pokemon
 */
async function attackWildPokemon() {
    if (!GameState.isMyTurn || !GameState.wildPokemon) {
        showToast("Não é sua vez!", 'warning');
        return;
    }
    
    // Stop the countdown timer — player has acted
    stopCatchingTimer();
    
    setLoading(true);
    
    try {
        const result = await apiCall(API.catching, { action: 'attack' });
        
        if (result.success) {
            let msg = `Dealt ${result.damage} damage!`;
            if (result.type_multiplier > 1) {
                msg += ' Super effective!';
            } else if (result.type_multiplier < 1) {
                msg += ' Not very effective...';
            }
            
            if (result.defeated) {
                msg += ` The wild Pokémon fled!`;
            }
            
            if (result.evolved) {
                showToast(`Seu Pokémon evoluiu para ${result.evolved.to}!`, 'success');
            }
            
            showToast(msg, 'info');
            
            // State will be updated via SSE
        } else {
            showToast(result.error || 'Ataque falhou', 'error');
        }
    } catch (error) {
        console.error('Error attacking:', error);
        showToast('Erro ao atacar', 'error');
    }
    
    setLoading(false);
}

/**
 * Add a message to the catching log
 */
function addCatchingLog(message, type = 'info') {
    if (!DOM.catchingLogMessages) return;
    
    const entry = document.createElement('div');
    entry.className = `log-entry log-${type}`;
    entry.innerHTML = `<span class="log-time">${new Date().toLocaleTimeString()}</span> ${message}`;
    
    DOM.catchingLogMessages.appendChild(entry);
    DOM.catchingLogMessages.scrollTop = DOM.catchingLogMessages.scrollHeight;
    
    // Keep only last 50 messages
    while (DOM.catchingLogMessages.children.length > 50) {
        DOM.catchingLogMessages.removeChild(DOM.catchingLogMessages.firstChild);
    }
}

/**
 * Handle keyboard shortcuts for catching phase
 */
function handleCatchingKeyboard(e) {
    if (GameState.currentScreen !== 'catching' || !GameState.isMyTurn) return;
    
    switch (e.key.toLowerCase()) {
        case 'c':
            if (!DOM.btnCatch?.disabled) attemptCatch(false);
            break;
        case 'u':
            if (!DOM.btnUltraCatch?.disabled) attemptCatch(true);
            break;
        case 'a':
            if (!DOM.btnAttack?.disabled) attackWildPokemon();
            break;
    }
}

// ============================================
// END CATCHING PHASE FUNCTIONS
// ============================================

// ============================================
// TOWN PHASE FUNCTIONS
// ============================================

/**
 * Town Phase State
 */
const TownState = {
    playerMoney: 0,
    ultraBalls: 0,
    hasMegaStone: false,
    usedMegaStone: false,
    team: [],
    activeSlot: 0,
    isReady: false,
    players: [],
    selectedPokemonForSell: null,
    selectedPokemonForMega: null,
    shopPrices: {
        ultra_ball: 3,
        evo_soda: 1,
        mega_stone: 5,
        hp_boost: 2,
        attack_boost: 2,
        speed_boost: 2
    }
};

/**
 * Initialize Town Phase
 */
async function initTownPhase() {
    console.log('Initializing Town Phase...');
    
    // Show leave game button
    DOM.btnLeaveGame?.classList.remove('hidden');
    
    // Load town state from server
    await refreshTownState();
    
    // Setup town event listeners
    setupTownListeners();
    
    // Start the 60-second town countdown timer
    startTownTimer();
}

/**
 * Setup Town Phase event listeners
 */
function setupTownListeners() {
    // Shop buttons
    const btnBuyUltra = document.getElementById('btn-buy-ultra');
    const btnBuyEvoSoda = document.getElementById('btn-buy-evo-soda');
    const btnBuyMegaStone = document.getElementById('btn-buy-mega-stone');
    const btnBuyHpBoost = document.getElementById('btn-buy-hp-boost');
    const btnBuyAttackBoost = document.getElementById('btn-buy-attack-boost');
    const btnBuySpeedBoost = document.getElementById('btn-buy-speed-boost');
    const btnTownReady = document.getElementById('btn-town-ready');
    
    btnBuyUltra?.addEventListener('click', buyUltraBall);
    btnBuyEvoSoda?.addEventListener('click', buyEvoSoda);
    btnBuyMegaStone?.addEventListener('click', buyMegaStone);
    btnBuyHpBoost?.addEventListener('click', () => buyStatBoost('hp'));
    btnBuyAttackBoost?.addEventListener('click', () => buyStatBoost('attack'));
    btnBuySpeedBoost?.addEventListener('click', () => buyStatBoost('speed'));
    btnTownReady?.addEventListener('click', toggleTownReady);
}

/**
 * Refresh Town State from server
 */
async function refreshTownState() {
    try {
        const result = await apiCall(
            `api/town.php?action=get_state&room_code=${GameState.roomCode}&player_id=${GameState.playerId}`,
            {},
            'GET'
        );
        
        if (!result.success) {
            showToast('Falha ao carregar estado da cidade', 'error');
            return;
        }
        
        // Check if game state has changed (e.g., town → tournament)
        if (result.room.game_state && result.room.game_state !== 'town') {
            console.log(`Town state polling detected phase change to: ${result.room.game_state}`);
            handleGameStateChange(result.room.game_state);
            return;
        }
        
        // Update local state
        TownState.playerMoney = result.player.money;
        TownState.ultraBalls = result.player.ultra_balls;
        TownState.hasMegaStone = result.player.has_mega_stone || false;
        TownState.usedMegaStone = result.player.used_mega_stone || false;
        TownState.team = result.team;
        TownState.activeSlot = result.player.active_pokemon_slot;
        TownState.isReady = result.player.is_ready;
        TownState.players = result.players;
        TownState.shopPrices = result.shop_prices || TownState.shopPrices;
        GameState.currentRoute = result.room.current_route;
        
        // Render UI
        renderTownUI();
        
    } catch (error) {
        console.error('Error loading town state:', error);
        showToast('Erro ao carregar dados da cidade', 'error');
    }
}

/**
 * Render Town UI
 */
function renderTownUI() {
    // Update header info
    const moneyDisplay = document.getElementById('town-player-money');
    const routeIndicator = document.getElementById('town-route-indicator');
    const ultraCount = document.getElementById('town-ultra-count');
    
    if (moneyDisplay) moneyDisplay.textContent = `R$ ${TownState.playerMoney}`;
    if (routeIndicator) routeIndicator.textContent = `Rota ${GameState.currentRoute}/5`;
    if (ultraCount) ultraCount.textContent = TownState.ultraBalls;
    
    // Update shop button states
    const btnBuyUltra = document.getElementById('btn-buy-ultra');
    const btnBuyEvoSoda = document.getElementById('btn-buy-evo-soda');
    const btnBuyMegaStone = document.getElementById('btn-buy-mega-stone');
    
    if (btnBuyUltra) {
        btnBuyUltra.disabled = TownState.playerMoney < TownState.shopPrices.ultra_ball;
    }
    if (btnBuyEvoSoda) {
        // Check if active Pokemon can gain EXP
        const activePokemon = TownState.team.find(p => p.slot === TownState.activeSlot);
        const canGainExp = activePokemon && activePokemon.can_evolve;
        btnBuyEvoSoda.disabled = TownState.playerMoney < TownState.shopPrices.evo_soda || !canGainExp;
    }
    if (btnBuyMegaStone) {
        // Check if active Pokemon can Mega Evolve
        const activePokemon = TownState.team.find(p => p.slot === TownState.activeSlot);
        const canActiveMegaEvolve = activePokemon && 
                                     activePokemon.has_mega && 
                                     activePokemon.mega_evolution_id && 
                                     !activePokemon.is_mega;
        
        // Can buy mega stone if: has enough money AND hasn't used one yet AND active Pokemon can mega evolve
        const canBuyMega = TownState.playerMoney >= TownState.shopPrices.mega_stone && 
                          !TownState.hasMegaStone && 
                          !TownState.usedMegaStone &&
                          canActiveMegaEvolve;
        btnBuyMegaStone.disabled = !canBuyMega;
        
        // Update button text based on state
        if (TownState.usedMegaStone) {
            btnBuyMegaStone.innerHTML = '<span class="shop-item-icon">💎</span><span class="shop-item-name">Mega Stone</span><span class="shop-item-price">USADO</span>';
            btnBuyMegaStone.title = 'Você já usou sua Mega Stone nesta partida';
        } else if (canActiveMegaEvolve) {
            btnBuyMegaStone.innerHTML = `<span class="shop-item-icon">💎</span><span class="shop-item-name">Mega Evoluir ${activePokemon.name}</span><span class="shop-item-price">R$ ${TownState.shopPrices.mega_stone}</span>`;
            btnBuyMegaStone.title = `Mega Evoluir ${activePokemon.name} → ${activePokemon.mega_name}`;
        } else {
            btnBuyMegaStone.innerHTML = `<span class="shop-item-icon">💎</span><span class="shop-item-name">Mega Stone</span><span class="shop-item-price">R$ ${TownState.shopPrices.mega_stone}</span>`;
            btnBuyMegaStone.title = 'Selecione um Pokémon com Mega Evolução como ativo';
        }
    }
    
    // Update stat boost button states
    const btnBuyHpBoost = document.getElementById('btn-buy-hp-boost');
    const btnBuyAttackBoost = document.getElementById('btn-buy-attack-boost');
    const btnBuySpeedBoost = document.getElementById('btn-buy-speed-boost');
    const hasActivePokemon = TownState.team.some(p => p.slot === TownState.activeSlot);
    
    if (btnBuyHpBoost) {
        btnBuyHpBoost.disabled = TownState.playerMoney < TownState.shopPrices.hp_boost || !hasActivePokemon;
    }
    if (btnBuyAttackBoost) {
        btnBuyAttackBoost.disabled = TownState.playerMoney < TownState.shopPrices.attack_boost || !hasActivePokemon;
    }
    if (btnBuySpeedBoost) {
        btnBuySpeedBoost.disabled = TownState.playerMoney < TownState.shopPrices.speed_boost || !hasActivePokemon;
    }
    
    // Render team grid
    renderTownTeamGrid();
    
    // Render players list
    renderTownPlayersList();
    
    // Update ready button
    updateReadyButton();
}

/**
 * Render Town Team Grid
 */
function renderTownTeamGrid() {
    const grid = document.getElementById('town-team-grid');
    const activeInfo = document.getElementById('town-active-name');
    
    if (!grid) return;
    
    grid.innerHTML = '';
    
    // Debug: log team data
    console.log('Town Team Data:', TownState.team);
    
    // Create 6 slots (max team size)
    for (let i = 0; i < 6; i++) {
        const pokemon = TownState.team.find(p => p.slot === i);
        const slot = document.createElement('div');
        slot.className = 'town-pokemon-slot';
        
        if (pokemon) {
            const isActive = i === TownState.activeSlot;
            const sellPrice = 2 + pokemon.evolution_stage;
            const canEvolve = pokemon.can_evolve;
            const expDisplay = pokemon.exp || 0;
            const canMegaEvolve = pokemon.has_mega && pokemon.mega_evolution_id && !pokemon.is_mega;
            const isMega = pokemon.is_mega;
            
            // Ensure we have a valid sprite URL
            const spriteUrl = pokemon.sprite_url || `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${pokemon.pokemon_id}.png`;
            console.log(`Pokemon ${pokemon.name} (ID: ${pokemon.pokemon_id}): sprite_url = ${spriteUrl}`);
            
            if (isActive) slot.classList.add('active');
            if (isMega) slot.classList.add('mega-evolved');
            if (canMegaEvolve && TownState.hasMegaStone) slot.classList.add('can-mega-evolve');
            
            // Create image element separately to add load/error handlers
            const img = document.createElement('img');
            img.src = spriteUrl;
            img.alt = pokemon.name;
            img.className = 'team-pokemon-sprite';
            img.onload = () => console.log(`✓ Image loaded: ${pokemon.name}`);
            img.onerror = () => {
                console.error(`✗ Image FAILED: ${pokemon.name} - ${spriteUrl}`);
                img.src = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/0.png';
            };
            
            slot.appendChild(img);
            
            // Add Mega badge if this Pokemon is mega evolved
            if (isMega) {
                const megaBadge = document.createElement('span');
                megaBadge.className = 'pokemon-mega-badge';
                megaBadge.textContent = 'MEGA';
                slot.appendChild(megaBadge);
            }
            
            // Add Mega evolution indicator if player has mega stone and Pokemon can mega evolve
            if (canMegaEvolve && TownState.hasMegaStone) {
                const megaIndicator = document.createElement('span');
                megaIndicator.className = 'pokemon-mega-indicator';
                megaIndicator.textContent = '💎';
                megaIndicator.title = `Mega Evolução disponível → ${pokemon.mega_name}`;
                slot.appendChild(megaIndicator);
            }
            
            if (canEvolve) {
                const expBadge = document.createElement('span');
                expBadge.className = 'pokemon-exp-badge';
                expBadge.textContent = expDisplay;
                slot.appendChild(expBadge);
            }
            
            const sellBadge = document.createElement('span');
            sellBadge.className = 'pokemon-sell-badge';
            sellBadge.textContent = `$${sellPrice}`;
            slot.appendChild(sellBadge);
            
            // Show stat bonuses if any
            const bonusHp = pokemon.bonus_hp || 0;
            const bonusAtk = pokemon.bonus_attack || 0;
            const bonusSpd = pokemon.bonus_speed || 0;
            if (bonusHp > 0 || bonusAtk > 0 || bonusSpd > 0) {
                const bonusBadge = document.createElement('span');
                bonusBadge.className = 'pokemon-bonus-badge';
                const bonusParts = [];
                if (bonusHp > 0) bonusParts.push(`❤️+${bonusHp}`);
                if (bonusAtk > 0) bonusParts.push(`⚔️+${bonusAtk}`);
                if (bonusSpd > 0) bonusParts.push(`💨+${bonusSpd}`);
                bonusBadge.textContent = bonusParts.join(' ');
                slot.appendChild(bonusBadge);
            }
            
            let tooltipText = `${pokemon.name}${isActive ? ' (Ativo)' : ''}${isMega ? ' (MEGA)' : ''}\nHP: ${pokemon.hp}${bonusHp > 0 ? `(+${bonusHp})` : ''} | ATQ: ${pokemon.attack}${bonusAtk > 0 ? `(+${bonusAtk})` : ''} | VEL: ${pokemon.speed}${bonusSpd > 0 ? `(+${bonusSpd})` : ''}`;
            if (canEvolve) tooltipText += `\nEXP: ${expDisplay}/5`;
            if (canMegaEvolve) tooltipText += `\n💎 Pode Mega Evoluir → ${pokemon.mega_name}`;
            tooltipText += `\nVender por R$${sellPrice}`;
            slot.title = tooltipText;
            
            slot.addEventListener('click', () => handleTownPokemonClick(pokemon, i));
        } else {
            slot.classList.add('empty');
            slot.innerHTML = '<span class="pokemon-name">Vazio</span>';
        }
        
        grid.appendChild(slot);
    }
    
    // Update active Pokemon name
    const activePokemon = TownState.team.find(p => p.slot === TownState.activeSlot);
    if (activeInfo) {
        activeInfo.textContent = activePokemon ? activePokemon.name : '---';
    }
}

/**
 * Handle clicking on a Pokemon in the town team grid
 */
function handleTownPokemonClick(pokemon, slot) {
    // If clicking the active Pokemon, show sell confirmation
    if (slot === TownState.activeSlot) {
        // Only show sell option if we have more than 1 Pokemon
        if (TownState.team.length > 1) {
            showSellConfirmation(pokemon);
        } else {
            showToast('Não pode vender seu último Pokémon!', 'warning');
        }
    } else {
        // Set as active Pokemon
        setTownActivePokemon(slot);
    }
}

/**
 * Set active Pokemon (Town Phase)
 */
async function setTownActivePokemon(slot) {
    try {
        const result = await apiCall('api/town.php?action=set_active', {
            room_code: GameState.roomCode,
            player_id: GameState.playerId,
            slot: slot
        });
        
        if (result.success) {
            TownState.activeSlot = slot;
            showToast(result.message, 'success');
            renderTownUI();
        } else {
            showToast(result.error || 'Falha ao trocar Pokémon', 'error');
        }
    } catch (error) {
        console.error('Error setting active Pokemon:', error);
        showToast('Erro ao trocar Pokémon', 'error');
    }
}

/**
 * Show sell confirmation modal
 */
function showSellConfirmation(pokemon) {
    TownState.selectedPokemonForSell = pokemon;
    
    const sellPrice = 2 + pokemon.evolution_stage;
    
    // Create modal
    const overlay = document.createElement('div');
    overlay.className = 'sell-modal-overlay';
    overlay.id = 'sell-modal-overlay';
    overlay.innerHTML = `
        <div class="sell-modal">
            <h3>Vender Pokémon?</h3>
            <div class="sell-modal-pokemon">
                <img src="${pokemon.sprite_url}" alt="${pokemon.name}">
                <span>${pokemon.name}</span>
                <span class="sell-modal-price">R$ ${sellPrice}</span>
            </div>
            <div class="sell-modal-actions">
                <button class="btn btn-danger" id="btn-confirm-sell">Vender</button>
                <button class="btn btn-secondary" id="btn-cancel-sell">Cancelar</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    // Setup modal buttons
    document.getElementById('btn-confirm-sell').addEventListener('click', confirmSellPokemon);
    document.getElementById('btn-cancel-sell').addEventListener('click', closeSellModal);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeSellModal();
    });
}

/**
 * Close sell confirmation modal
 */
function closeSellModal() {
    const overlay = document.getElementById('sell-modal-overlay');
    if (overlay) overlay.remove();
    TownState.selectedPokemonForSell = null;
}

/**
 * Confirm and execute Pokemon sale
 */
async function confirmSellPokemon() {
    const pokemon = TownState.selectedPokemonForSell;
    if (!pokemon) return;
    
    closeSellModal();
    
    try {
        const result = await apiCall('api/town.php?action=sell_pokemon', {
            room_code: GameState.roomCode,
            player_id: GameState.playerId,
            team_id: pokemon.team_id
        });
        
        if (result.success) {
            showToast(result.message, 'success');
            TownState.playerMoney = result.new_money;
            addTownLogMessage(`Vendeu ${pokemon.name} por R$${result.sell_price}`, 'sell');
            await refreshTownState();
        } else {
            showToast(result.error || 'Falha ao vender Pokémon', 'error');
        }
    } catch (error) {
        console.error('Error selling Pokemon:', error);
        showToast('Erro ao vender Pokémon', 'error');
    }
}

/**
 * Buy Ultra Ball
 */
async function buyUltraBall() {
    if (TownState.playerMoney < 3) {
        showToast('Dinheiro insuficiente!', 'warning');
        return;
    }
    
    try {
        const result = await apiCall('api/town.php?action=buy_ultra_ball', {
            room_code: GameState.roomCode,
            player_id: GameState.playerId
        });
        
        if (result.success) {
            TownState.playerMoney = result.new_money;
            TownState.ultraBalls = result.new_ultra_balls;
            showToast(result.message, 'success');
            addTownLogMessage('Comprou Ultra Ball!', 'purchase');
            renderTownUI();
        } else {
            showToast(result.error || 'Falha na compra', 'error');
        }
    } catch (error) {
        console.error('Error buying ultra ball:', error);
        showToast('Erro ao comprar Ultra Ball', 'error');
    }
}

/**
 * Buy Evo Soda
 */
async function buyEvoSoda() {
    if (TownState.playerMoney < 1) {
        showToast('Dinheiro insuficiente!', 'warning');
        return;
    }
    
    try {
        const result = await apiCall('api/town.php?action=buy_evo_soda', {
            room_code: GameState.roomCode,
            player_id: GameState.playerId
        });
        
        if (result.success) {
            TownState.playerMoney = result.new_money;
            showToast(result.message, 'success');
            
            if (result.evolved) {
                addTownLogMessage(`🎉 ${result.evolved_to} evoluiu!`, 'evolution');
            } else {
                addTownLogMessage('Usou Evo Soda - +1 EXP!', 'purchase');
            }
            
            await refreshTownState();
        } else {
            showToast(result.error || 'Falha na compra', 'error');
        }
    } catch (error) {
        console.error('Error buying evo soda:', error);
        showToast('Erro ao comprar Evo Soda', 'error');
    }
}

/**
 * Buy Mega Stone
 */
async function buyMegaStone() {
    if (TownState.playerMoney < TownState.shopPrices.mega_stone) {
        showToast('Dinheiro insuficiente!', 'warning');
        return;
    }
    
    if (TownState.hasMegaStone || TownState.usedMegaStone) {
        showToast('Você só pode usar uma Mega Stone por partida!', 'warning');
        return;
    }
    
    // Check if active Pokemon can Mega Evolve
    const activePokemon = TownState.team.find(p => p.slot === TownState.activeSlot);
    if (!activePokemon || !activePokemon.has_mega || !activePokemon.mega_evolution_id || activePokemon.is_mega) {
        showToast('Selecione um Pokémon com Mega Evolução como ativo!', 'warning');
        return;
    }
    
    try {
        // Buy Mega Stone and Mega Evolve in one action
        const result = await apiCall('api/town.php?action=buy_and_mega_evolve', {
            room_code: GameState.roomCode,
            player_id: GameState.playerId
        });
        
        if (result.success) {
            TownState.playerMoney = result.new_money;
            TownState.hasMegaStone = false;
            TownState.usedMegaStone = true;
            showToast(`💎 ${activePokemon.name} Mega Evoluiu para ${result.mega_name}!`, 'success');
            addTownLogMessage(`💎 ${activePokemon.name} Mega Evoluiu para ${result.mega_name}!`, 'mega-evolution');
            await refreshTownState();
        } else {
            showToast(result.error || 'Falha na Mega Evolução', 'error');
        }
    } catch (error) {
        console.error('Error buying mega stone:', error);
        showToast('Erro ao comprar Mega Stone', 'error');
    }
}

/**
 * Buy a stat boost (HP, Attack, or Speed) for the active Pokemon
 */
async function buyStatBoost(statType) {
    const priceKey = `${statType}_boost`;
    const price = TownState.shopPrices[priceKey] || 2;
    
    if (TownState.playerMoney < price) {
        showToast('Dinheiro insuficiente!', 'warning');
        return;
    }
    
    const activePokemon = TownState.team.find(p => p.slot === TownState.activeSlot);
    if (!activePokemon) {
        showToast('Nenhum Pokémon ativo!', 'warning');
        return;
    }
    
    try {
        const result = await apiCall(`api/town.php?action=buy_${statType}_boost`, {
            room_code: GameState.roomCode,
            player_id: GameState.playerId
        });
        
        if (result.success) {
            TownState.playerMoney = result.new_money;
            showToast(result.message, 'success');
            
            const statNames = { hp: 'HP', attack: 'Ataque', speed: 'Velocidade' };
            addTownLogMessage(`${result.pokemon_name} ganhou +${result.bonus_value} ${statNames[statType]}!`, 'purchase');
            await refreshTownState();
        } else {
            showToast(result.error || 'Falha na compra', 'error');
        }
    } catch (error) {
        console.error(`Error buying ${statType} boost:`, error);
        showToast('Erro ao comprar boost', 'error');
    }
}

/**
 * Show Mega Evolution confirmation modal
 */
function showMegaEvolutionConfirmation(pokemon) {
    TownState.selectedPokemonForMega = pokemon;
    
    // Create modal
    const overlay = document.createElement('div');
    overlay.className = 'sell-modal-overlay mega-evolution-modal';
    overlay.id = 'mega-evolution-modal-overlay';
    overlay.innerHTML = `
        <div class="sell-modal mega-modal">
            <h3>💎 Mega Evolução</h3>
            <div class="mega-evolution-preview">
                <div class="mega-pokemon-before">
                    <img src="${pokemon.sprite_url}" alt="${pokemon.name}">
                    <span>${pokemon.name}</span>
                </div>
                <div class="mega-arrow">→</div>
                <div class="mega-pokemon-after">
                    <img src="${pokemon.mega_sprite_url}" alt="${pokemon.mega_name}">
                    <span>${pokemon.mega_name}</span>
                </div>
            </div>
            <p class="mega-warning">⚠️ Você só pode usar UMA Mega Evolução por partida!</p>
            <p class="mega-info">A Mega Evolução é permanente durante o jogo.</p>
            <div class="sell-modal-buttons">
                <button class="btn-cancel" onclick="closeMegaEvolutionModal()">Cancelar</button>
                <button class="btn-mega-confirm" onclick="confirmMegaEvolution()">💎 Mega Evoluir!</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);
}

/**
 * Close Mega Evolution modal
 */
function closeMegaEvolutionModal() {
    const overlay = document.getElementById('mega-evolution-modal-overlay');
    if (overlay) {
        overlay.remove();
    }
    TownState.selectedPokemonForMega = null;
}

/**
 * Confirm Mega Evolution
 */
async function confirmMegaEvolution() {
    const pokemon = TownState.selectedPokemonForMega;
    if (!pokemon) return;
    
    closeMegaEvolutionModal();
    
    try {
        const result = await apiCall('api/town.php?action=mega_evolve', {
            room_code: GameState.roomCode,
            player_id: GameState.playerId,
            team_id: pokemon.team_id
        });
        
        if (result.success) {
            TownState.hasMegaStone = false;
            TownState.usedMegaStone = true;
            showToast(result.message, 'success');
            addTownLogMessage(`💎 ${pokemon.name} Mega Evoluiu para ${result.mega_name}!`, 'mega-evolution');
            await refreshTownState();
        } else {
            showToast(result.error || 'Falha na Mega Evolução', 'error');
        }
    } catch (error) {
        console.error('Error mega evolving:', error);
        showToast('Erro ao Mega Evoluir', 'error');
    }
}

/**
 * Toggle ready status
 */
async function toggleTownReady() {
    try {
        const result = await apiCall('api/town.php?action=toggle_ready', {
            room_code: GameState.roomCode,
            player_id: GameState.playerId
        });
        
        if (result.success) {
            TownState.isReady = result.is_ready;
            updateReadyButton();
            
            // Update ready status display
            const readyStatus = document.getElementById('town-ready-status');
            if (readyStatus) {
                readyStatus.textContent = `${result.ready_count}/${result.total_players} jogadores prontos`;
            }
            
            if (result.all_ready) {
                showToast('Todos os jogadores prontos! Iniciando Torneio...', 'success');
                // Game state change will be handled by SSE
            } else {
                showToast(result.is_ready ? 'Você está pronto!' : 'Pronto cancelado', 'info');
            }
        } else {
            showToast(result.error || 'Falha ao atualizar status de pronto', 'error');
        }
    } catch (error) {
        console.error('Error toggling ready:', error);
        showToast('Erro ao atualizar status de pronto', 'error');
    }
}

/**
 * Update ready button state
 */
function updateReadyButton() {
    const btn = document.getElementById('btn-town-ready');
    if (!btn) return;
    
    if (TownState.isReady) {
        btn.textContent = 'Cancelar Pronto';
        btn.classList.add('is-ready');
    } else {
        btn.textContent = 'Pronto para Torneio';
        btn.classList.remove('is-ready');
    }
    
    // Update ready count
    const readyCount = TownState.players.filter(p => p.is_ready).length;
    const readyStatus = document.getElementById('town-ready-status');
    if (readyStatus) {
        readyStatus.textContent = `${readyCount}/${TownState.players.length} jogadores prontos`;
    }
}

/**
 * Render players list in town
 */
function renderTownPlayersList() {
    const list = document.getElementById('town-players-list');
    if (!list) return;
    
    list.innerHTML = '';
    
    TownState.players.forEach(player => {
        const card = document.createElement('div');
        card.className = 'town-player-card';
        
        if (player.is_ready) card.classList.add('ready');
        if (player.id == GameState.playerId) card.classList.add('is-self');
        
        const avatarIndex = (player.avatar || 1) - 1;
        const avatar = AVATARS[avatarIndex] || '😎';
        
        card.innerHTML = `
            <div class="town-player-avatar">${avatar}</div>
            <div class="town-player-info">
                <span class="town-player-name">${escapeHtml(player.player_name)}</span>
                <span class="town-player-status">${player.is_ready ? '✓ Ready' : 'Shopping...'}</span>
            </div>
        `;
        
        list.appendChild(card);
    });
}

/**
 * Add message to town log
 */
function addTownLogMessage(message, type = 'info') {
    const logMessages = document.getElementById('town-log-messages');
    if (!logMessages) return;
    
    const entry = document.createElement('div');
    entry.className = `log-entry log-${type}`;
    entry.innerHTML = `<span class="log-time">${new Date().toLocaleTimeString()}</span> ${message}`;
    
    logMessages.appendChild(entry);
    logMessages.scrollTop = logMessages.scrollHeight;
    
    // Keep only last 30 messages
    while (logMessages.children.length > 30) {
        logMessages.removeChild(logMessages.firstChild);
    }
}

/**
 * Handle Town SSE events
 */
function handleTownEvent(eventType, data) {
    switch (eventType) {
        case 'town_purchase':
            if (data.player_id != GameState.playerId) {
                let itemName;
                if (data.item === 'ultra_ball') itemName = 'Ultra Ball';
                else if (data.item === 'evo_soda') itemName = 'Evo Soda';
                else if (data.item === 'hp_boost') itemName = `HP Up para ${data.pokemon_name}`;
                else if (data.item === 'attack_boost') itemName = `Protein para ${data.pokemon_name}`;
                else if (data.item === 'speed_boost') itemName = `Carbos para ${data.pokemon_name}`;
                else itemName = data.item;
                addTownLogMessage(`${data.player_name} comprou ${itemName}`, 'info');
                if (data.evolved) {
                    addTownLogMessage(`${data.pokemon_name} de ${data.player_name} evoluiu para ${data.evolved_to}!`, 'evolution');
                }
            }
            break;
            
        case 'town_sell':
            if (data.player_id != GameState.playerId) {
                addTownLogMessage(`${data.player_name} vendeu ${data.pokemon_name}`, 'info');
            }
            break;
            
        case 'town_ready_toggle':
            // Refresh players list to update ready status
            refreshTownState();
            break;
            
        case 'town_phase_change':
            if (data.new_phase === 'tournament') {
                showToast('Todos os jogadores prontos! Iniciando Torneio...', 'success');
                handleGameStateChange('tournament');
            }
            break;
            
        case 'town_switch_active':
            if (data.player_id != GameState.playerId) {
                addTownLogMessage(`${data.player_name} trocou para ${data.pokemon_name}`, 'info');
            }
            break;
    }
}

// ============================================
// END TOWN PHASE FUNCTIONS
// ============================================

// ============================================
// TOURNAMENT PHASE FUNCTIONS
// ============================================

/**
 * Tournament Phase State
 */
const TournamentState = {
    brackets: [],
    byePlayer: null,
    currentMatch: null,
    players: [],
    completedMatches: 0,
    totalMatches: 0,
    isParticipant: false,
    hostPlayerId: null,
    isTiebreaker: false,
    tiebreakerType: '',
    tiebreakerRound: 1,
    // Ranked mode fields
    gameMode: 'casual',
    rankedCountdownTimer: null,
    rankedCountdownSeconds: 10,
    allBattlesStarted: false,
    myMatchIndex: null
};

/**
 * Initialize Tournament Phase
 */
async function initTournamentPhase() {
    console.log('Initializing Tournament Phase...');
    
    // Stop any existing ranked countdown
    stopRankedCountdown();
    
    // Load tournament state from server
    await refreshTournamentState();
    
    // Setup tournament event listeners
    setupTournamentListeners();
    
    // In ranked mode, auto-start the countdown for battles
    if (TournamentState.gameMode === 'ranked' && !TournamentState.allBattlesStarted) {
        const allComplete = TournamentState.brackets.every(b => b.status === 'completed');
        if (!allComplete) {
            startRankedCountdown();
        }
    }
}

/**
 * Setup Tournament Phase event listeners
 */
function setupTournamentListeners() {
    const btnStartBattle = document.getElementById('btn-start-battle');
    const btnNextRoute = document.getElementById('btn-next-route');
    
    // Remove old listeners by cloning
    if (btnStartBattle) {
        const newBtn = btnStartBattle.cloneNode(true);
        btnStartBattle.parentNode.replaceChild(newBtn, btnStartBattle);
        newBtn.addEventListener('click', startNextBattle);
    }
    
    if (btnNextRoute) {
        const newBtn = btnNextRoute.cloneNode(true);
        btnNextRoute.parentNode.replaceChild(newBtn, btnNextRoute);
        newBtn.addEventListener('click', completeTournament);
    }
}

/**
 * Refresh Tournament State from server
 */
async function refreshTournamentState() {
    try {
        const result = await apiCall(
            `api/tournament.php?action=get_state&room_code=${GameState.roomCode}&player_id=${GameState.playerId}`,
            {},
            'GET'
        );
        
        if (!result.success) {
            showToast('Falha ao carregar estado do torneio', 'error');
            return;
        }
        
        // Check if game state has changed (e.g., tournament → catching for next route, or finished)
        if (result.room.game_state && result.room.game_state !== 'tournament') {
            console.log(`Tournament state polling detected phase change to: ${result.room.game_state}`);
            handleGameStateChange(result.room.game_state);
            return;
        }
        
        // Update local state
        TournamentState.brackets = result.tournament.brackets;
        TournamentState.byePlayer = result.tournament.bye_player;
        TournamentState.currentMatch = result.current_match;
        TournamentState.players = result.players;
        TournamentState.completedMatches = result.tournament.completed_matches;
        TournamentState.totalMatches = result.tournament.total_matches;
        TournamentState.hostPlayerId = result.room.host_player_id;
        TournamentState.isTiebreaker = result.tournament.is_tiebreaker || false;
        TournamentState.tiebreakerType = result.tournament.tiebreaker_type || '';
        TournamentState.tiebreakerRound = result.tournament.round || 1;
        TournamentState.gameMode = result.room.game_mode || GameState.gameMode || 'casual';
        TournamentState.allBattlesStarted = result.tournament.all_battles_started || false;
        GameState.currentRoute = result.room.current_route;
        
        // Check if this player is in the current match
        TournamentState.isParticipant = TournamentState.currentMatch && 
            (TournamentState.currentMatch.player1?.id == GameState.playerId || 
             TournamentState.currentMatch.player2?.id == GameState.playerId);
        
        // Render UI
        renderTournamentUI();
        
    } catch (error) {
        console.error('Error loading tournament state:', error);
        showToast('Erro ao carregar dados do torneio', 'error');
    }
}
/**
 * Render Tournament UI
 */
function renderTournamentUI() {
    // Update header info
    const routeDisplay = document.getElementById('tournament-route');
    const progressDisplay = document.getElementById('tournament-progress');
    const hostBadge = document.getElementById('tournament-host-badge');
    const tournamentHeader = document.querySelector('.tournament-header h2');
    
    // Check if this is a tiebreaker tournament
    const isTiebreaker = TournamentState.isTiebreaker || false;
    const tiebreakerType = TournamentState.tiebreakerType || '';
    
    if (isTiebreaker) {
        if (routeDisplay) routeDisplay.textContent = `⚔️ DESEMPATE`;
        if (tournamentHeader) {
            tournamentHeader.textContent = tiebreakerType === 'final_tiebreaker' 
                ? '🏆 FINAL TIEBREAKER!' 
                : '⚔️ TIEBREAKER BATTLE!';
        }
    } else {
        if (routeDisplay) routeDisplay.textContent = `Rota ${GameState.currentRoute}/8`;
        if (tournamentHeader) tournamentHeader.textContent = '🏆 Torneio';
    }
    
    if (progressDisplay) progressDisplay.textContent = `Partida ${TournamentState.completedMatches}/${TournamentState.totalMatches}`;
    
    // Show host badge if this player is the host
    const isHost = String(GameState.playerId) === String(TournamentState.hostPlayerId);
    if (hostBadge) {
        if (isHost) {
            hostBadge.classList.remove('hidden');
        } else {
            hostBadge.classList.add('hidden');
        }
    }
    
    // Render brackets
    renderTournamentBrackets();
    
    // Render bye player if exists
    renderByePlayer();
    
    // Render current match panel
    renderCurrentMatchPanel();
    
    // Render standings
    renderTournamentStandings();
}

/**
 * Render Tournament Brackets
 */
function renderTournamentBrackets() {
    const bracketsContainer = document.getElementById('tournament-brackets');
    if (!bracketsContainer) return;
    
    bracketsContainer.innerHTML = '';
    
    if (TournamentState.brackets.length === 0) {
        bracketsContainer.innerHTML = '<p class="no-matches">Nenhuma partida agendada</p>';
        return;
    }
    
    TournamentState.brackets.forEach((bracket, index) => {
        const matchEl = document.createElement('div');
        matchEl.className = 'bracket-match';
        
        // Check if this is an NPC battle
        const isNpcBattle = bracket.is_npc_battle || bracket.player2?.is_npc;
        
        // Determine match status
        if (bracket.status === 'completed') {
            matchEl.classList.add('completed');
        } else if (bracket.status === 'in_progress') {
            matchEl.classList.add('current');
        } else if (TournamentState.currentMatch?.match_index === bracket.match_index) {
            matchEl.classList.add('current');
        }
        
        // Add NPC battle class for styling
        if (isNpcBattle) {
            matchEl.classList.add('npc-battle');
        }
        
        const player1 = bracket.player1;
        const player2 = bracket.player2;
        const winnerId = bracket.winner_id;
        
        const avatar1 = player1 ? (AVATARS[player1.avatar - 1] || '😎') : '?';
        // For NPC, use their emoji avatar directly
        const avatar2 = player2?.is_npc ? player2.avatar : (player2 ? (AVATARS[player2.avatar - 1] || '😎') : '?');
        
        const player1Class = winnerId ? (winnerId == player1?.id ? 'winner' : 'loser') : '';
        const player2Class = winnerId ? (winnerId == player2?.id ? 'winner' : 'loser') : '';
        
        let resultHtml = '';
        if (bracket.status === 'completed') {
            resultHtml = `<span class="winner-badge">✓ ${bracket.winner?.name || 'Vencedor'}</span>`;
        } else if (bracket.status === 'in_progress') {
            resultHtml = `<span class="pending">⚔️ Em Andamento</span>`;
        } else {
            resultHtml = `<span class="pending">Pendente</span>`;
        }
        
        // Build player2 display (handle NPC differently)
        let player2Html = '';
        if (isNpcBattle && player2) {
            player2Html = `
                <div class="bracket-player npc-player ${player2Class}">
                    <span class="bracket-player-avatar npc-avatar">${avatar2}</span>
                    <div class="bracket-player-info">
                        <div class="bracket-player-name npc-name">${player2.name}</div>
                        <div class="bracket-player-title">${player2.title || 'Líder de Ginásio'}</div>
                    </div>
                </div>
            `;
        } else {
            player2Html = `
                <div class="bracket-player ${player2Class}">
                    <span class="bracket-player-avatar">${avatar2}</span>
                    <div class="bracket-player-info">
                        <div class="bracket-player-name">${player2?.name || 'A definir'}</div>
                        <div class="bracket-player-badges">🎖️ ${player2?.badges || 0}</div>
                    </div>
                </div>
            `;
        }
        
        matchEl.innerHTML = `
            <div class="bracket-match-number">${isNpcBattle ? '🏟️ Desafio de Ginásio' : `Partida ${index + 1}`}</div>
            <div class="bracket-players">
                <div class="bracket-player ${player1Class}">
                    <span class="bracket-player-avatar">${avatar1}</span>
                    <div class="bracket-player-info">
                        <div class="bracket-player-name">${player1?.name || 'TBD'}</div>
                        <div class="bracket-player-badges">🎖️ ${player1?.badges || 0}</div>
                    </div>
                </div>
                <span class="bracket-vs">VS</span>
                ${player2Html}
            </div>
            <div class="bracket-result">${resultHtml}</div>
        `;
        
        bracketsContainer.appendChild(matchEl);
    });
}

/**
 * Render Bye Player
 */
function renderByePlayer() {
    const byeContainer = document.getElementById('tournament-bye');
    const byePlayerInfo = document.getElementById('bye-player-info');
    
    if (!byeContainer || !byePlayerInfo) return;
    
    if (TournamentState.byePlayer) {
        byeContainer.classList.remove('hidden');
        const avatar = AVATARS[TournamentState.byePlayer.avatar - 1] || '😎';
        
        byePlayerInfo.innerHTML = `
            <span class="bye-player-avatar">${avatar}</span>
            <span class="bye-player-name">${TournamentState.byePlayer.name}</span>
            <span class="bye-player-badges">🎖️ ${TournamentState.byePlayer.badges}</span>
        `;
    } else {
        byeContainer.classList.add('hidden');
    }
}

/**
 * Render Current Match Panel
 */
function renderCurrentMatchPanel() {
    const matchPanel = document.getElementById('current-match-panel');
    const completePanel = document.getElementById('tournament-complete-panel');
    const matchPreview = document.getElementById('match-preview');
    const btnStartBattle = document.getElementById('btn-start-battle');
    const matchWaiting = document.getElementById('match-waiting');
    
    if (!matchPanel || !completePanel) return;
    
    const isRanked = TournamentState.gameMode === 'ranked';
    
    // Check if tournament is complete
    const allMatchesComplete = TournamentState.brackets.every(b => b.status === 'completed');
    
    // Debug: log host comparison
    console.log('Host check:', {
        playerId: GameState.playerId,
        hostPlayerId: TournamentState.hostPlayerId,
        areEqual: String(GameState.playerId) === String(TournamentState.hostPlayerId),
        isRanked: isRanked
    });
    
    const isHost = String(GameState.playerId) === String(TournamentState.hostPlayerId);
    
    if (allMatchesComplete) {
        matchPanel.classList.add('hidden');
        completePanel.classList.remove('hidden');
        
        if (isRanked) {
            // In ranked mode, auto-advance after a short delay
            const btnNextRoute = document.getElementById('btn-next-route');
            const waitingMsg = document.getElementById('tournament-complete-waiting');
            if (btnNextRoute) btnNextRoute.classList.add('hidden');
            if (waitingMsg) {
                waitingMsg.classList.remove('hidden');
                waitingMsg.textContent = 'Avançando automaticamente...';
            }
            // Auto-advance after 3 seconds
            setTimeout(() => {
                rankedCompleteTournament();
            }, 3000);
        } else {
            // Casual mode: only host can advance
            const btnNextRoute = document.getElementById('btn-next-route');
            const waitingMsg = document.getElementById('tournament-complete-waiting');
            
            if (btnNextRoute) {
                if (isHost) {
                    btnNextRoute.classList.remove('hidden');
                } else {
                    btnNextRoute.classList.add('hidden');
                }
            }
            
            if (waitingMsg) {
                if (isHost) {
                    waitingMsg.classList.add('hidden');
                } else {
                    waitingMsg.classList.remove('hidden');
                }
            }
        }
        return;
    }
    
    // In ranked mode, hide the current match panel (countdown handles everything)
    if (isRanked) {
        matchPanel.classList.add('hidden');
        completePanel.classList.add('hidden');
        return;
    }
    
    matchPanel.classList.remove('hidden');
    completePanel.classList.add('hidden');
    
    const match = TournamentState.currentMatch;
    if (!match) {
        matchPreview.innerHTML = '<p>Aguardando próxima partida...</p>';
        if (btnStartBattle) btnStartBattle.classList.add('hidden');
        return;
    }
    
    const player1 = match.player1;
    const player2 = match.player2;
    
    if (!player1 || !player2) {
        matchPreview.innerHTML = '<p>Carregando dados da partida...</p>';
        return;
    }
    
    const avatar1 = AVATARS[player1.avatar - 1] || '😎';
    const avatar2 = AVATARS[player2.avatar - 1] || '😎';
    
    const isPlayer1 = player1.id == GameState.playerId;
    const isPlayer2 = player2.id == GameState.playerId;
    
    document.getElementById('match-player1').className = `match-player ${isPlayer1 ? 'is-you' : ''}`;
    document.getElementById('match-player1').innerHTML = `
        <div class="match-player-avatar">${avatar1}</div>
        <div class="match-player-name">${player1.name}${isPlayer1 ? ' (Você)' : ''}</div>
        <div class="match-player-badges">🎖️ ${player1.badges}</div>
    `;
    
    document.getElementById('match-player2').className = `match-player ${isPlayer2 ? 'is-you' : ''}`;
    document.getElementById('match-player2').innerHTML = `
        <div class="match-player-avatar">${avatar2}</div>
        <div class="match-player-name">${player2.name}${isPlayer2 ? ' (Você)' : ''}</div>
        <div class="match-player-badges">🎖️ ${player2.badges}</div>
    `;
    
    // Show start button ONLY for host (casual mode only)
    if (btnStartBattle && matchWaiting) {
        if (isHost) {
            btnStartBattle.classList.remove('hidden');
            btnStartBattle.textContent = 'Iniciar Batalha!';
            matchWaiting.classList.add('hidden');
        } else {
            btnStartBattle.classList.add('hidden');
            matchWaiting.classList.remove('hidden');
            matchWaiting.textContent = TournamentState.isParticipant 
                ? 'Aguardando o anfitrião iniciar sua batalha...'
                : 'Aguardando o anfitrião iniciar a batalha...';
        }
    }
}

/**
 * Render Tournament Standings
 */
function renderTournamentStandings() {
    const standingsList = document.getElementById('tournament-standings-list');
    if (!standingsList) return;
    
    standingsList.innerHTML = '';
    
    // Add header showing badges needed to win
    const badgesToWin = 5;
    const header = document.createElement('div');
    header.className = 'standings-header';
    header.innerHTML = `<span class="standings-goal">🎯 Meta: ${badgesToWin} insígnias para vencer!</span>`;
    standingsList.appendChild(header);
    
    // Sort players by badges, then by money
    const sortedPlayers = [...TournamentState.players].sort((a, b) => {
        if (b.badges !== a.badges) return b.badges - a.badges;
        return b.money - a.money;
    });
    
    sortedPlayers.forEach((player, index) => {
        const rank = index + 1;
        const rankClass = rank === 1 ? 'gold' : (rank === 2 ? 'silver' : (rank === 3 ? 'bronze' : ''));
        const avatar = AVATARS[player.avatar_id - 1] || '😎';
        const isYou = player.id == GameState.playerId;
        const closeToWin = player.badges >= badgesToWin - 1; // 4+ badges
        const isWinner = player.badges >= badgesToWin;
        
        const playerEl = document.createElement('div');
        playerEl.className = `standings-player ${isYou ? 'is-you' : ''} ${closeToWin ? 'close-to-win' : ''} ${isWinner ? 'has-won' : ''}`;
        
        const badgesDisplay = `${player.badges}/${badgesToWin}`;
        
        playerEl.innerHTML = `
            <span class="standings-rank ${rankClass}">#${rank}</span>
            <span class="standings-player-avatar">${avatar}</span>
            <div class="standings-player-info">
                <div class="standings-player-name">${player.player_name}${isYou ? ' (Você)' : ''}</div>
                <div class="standings-player-badges">🎖️ ${badgesDisplay} ${isWinner ? '👑' : ''}</div>
            </div>
            <span class="standings-player-money">R$${player.money}</span>
        `;
        
        standingsList.appendChild(playerEl);
    });
}

/**
 * Start the next battle
 */
async function startNextBattle() {
    if (!TournamentState.currentMatch) {
        showToast('Nenhuma partida disponível', 'warning');
        return;
    }
    
    // Only host can start battles
    if (String(GameState.playerId) !== String(TournamentState.hostPlayerId)) {
        showToast('Apenas o anfitrião pode iniciar batalhas', 'warning');
        return;
    }
    
    setLoading(true);
    
    try {
        const result = await apiCall('api/tournament.php', {
            action: 'start_match',
            room_code: GameState.roomCode,
            match_index: TournamentState.currentMatch.match_index,
            player_id: GameState.playerId
        });
        
        if (result.success) {
            showToast('Batalha iniciando!', 'success');
            // Battle phase transition will be handled by SSE
        } else {
            showToast(result.error || 'Falha ao iniciar batalha', 'error');
        }
    } catch (error) {
        console.error('Error starting battle:', error);
        showToast('Erro ao iniciar batalha', 'error');
    }
    
    setLoading(false);
}

/**
 * Complete tournament and move to next phase
 */
async function completeTournament() {
    // Only host can advance to next route
    if (String(GameState.playerId) !== String(TournamentState.hostPlayerId)) {
        showToast('Apenas o anfitrião pode avançar para a próxima rota', 'warning');
        return;
    }
    
    setLoading(true);
    
    try {
        const result = await apiCall('api/tournament.php', {
            action: 'complete_tournament',
            room_code: GameState.roomCode,
            player_id: GameState.playerId
        });
        
        if (result.success) {
            if (result.game_finished) {
                showToast(`🏆 ${result.winner.name} venceu o jogo!`, 'success');
                // Will transition to victory screen via SSE
            } else {
                showToast(`Avançando para a Rota ${result.new_route}!`, 'success');
                // Will transition to catching phase via SSE
            }
        } else {
            showToast(result.error || 'Falha ao completar torneio', 'error');
        }
    } catch (error) {
        console.error('Error completing tournament:', error);
        showToast('Erro ao completar torneio', 'error');
    }
    
    setLoading(false);
}

/**
 * Handle Tournament SSE events
 */
function handleTournamentEvent(eventType, data) {
    console.log('handleTournamentEvent:', eventType, data);
    
    switch (eventType) {
        case 'battle_started':
            console.log('Battle started event - transitioning to battle screen');
            // Check if this is an NPC battle
            if (data.is_npc_battle) {
                const npcName = data.player2?.name || 'Líder de Ginásio';
                const npcTitle = data.player2?.title || '';
                showToast(`🏟️ Desafio de Ginásio: ${data.player1?.name} vs ${npcName}!`, 'info');
            } else {
                showToast(`Batalha: ${data?.player1?.name || 'Jogador 1'} vs ${data?.player2?.name || 'Jogador 2'}!`, 'info');
            }
            // Transition to battle screen
            handleGameStateChange('battle');
            break;
            
        case 'match_completed':
            showToast(`${data.winner_name} venceu a partida!`, 'info');
            refreshTournamentState();
            break;
            
        case 'tournament_updated':
            refreshTournamentState();
            break;
            
        case 'game_finished':
            let winMessage = `🏆 ${data.winner_name} venceu o jogo!`;
            if (data.win_type === 'badges') {
                winMessage = `🏆 ${data.winner_name} venceu com ${data.badges || 5} insígnias!`;
            } else if (data.win_type === 'most_badges') {
                winMessage = `🏆 ${data.winner_name} venceu com mais insígnias!`;
            } else if (data.win_type === 'tiebreaker') {
                winMessage = `🏆 ${data.winner_name} venceu o desempate e o jogo!`;
            }
            showToast(winMessage, 'success');
            handleGameStateChange('finished');
            break;
        
        // Ranked mode events
        case 'all_battles_started':
            console.log('[Ranked] All battles started simultaneously');
            stopRankedCountdown();
            showToast('⚔️ Todas as batalhas começaram!', 'info');
            handleGameStateChange('battle');
            break;
        
        case 'ranked_all_battles_complete':
            console.log('[Ranked] All battles complete');
            // Transition back to tournament to show results and auto-advance
            handleGameStateChange('tournament');
            refreshTournamentState();
            break;
    }
}

// ============================================
// RANKED TOURNAMENT HELPER FUNCTIONS
// ============================================

/**
 * Start the 10-second countdown before all ranked battles begin
 */
function startRankedCountdown() {
    stopRankedCountdown();
    
    TournamentState.rankedCountdownSeconds = 10;
    
    const countdownEl = document.getElementById('ranked-tournament-countdown');
    const countdownValue = document.getElementById('ranked-countdown-value');
    if (!countdownEl || !countdownValue) return;
    
    countdownEl.classList.remove('hidden');
    countdownValue.textContent = TournamentState.rankedCountdownSeconds;
    
    TournamentState.rankedCountdownTimer = setInterval(async () => {
        TournamentState.rankedCountdownSeconds--;
        countdownValue.textContent = Math.max(0, TournamentState.rankedCountdownSeconds);
        
        if (TournamentState.rankedCountdownSeconds <= 0) {
            stopRankedCountdown();
            console.log('[Ranked] Countdown finished — starting all battles');
            // Only one player needs to trigger the start (use host as tie-breaker)
            const isHost = String(GameState.playerId) === String(TournamentState.hostPlayerId);
            if (isHost) {
                await startAllRankedBattles();
            }
        }
    }, 1000);
}

/**
 * Stop the ranked countdown timer
 */
function stopRankedCountdown() {
    if (TournamentState.rankedCountdownTimer) {
        clearInterval(TournamentState.rankedCountdownTimer);
        TournamentState.rankedCountdownTimer = null;
    }
    const countdownEl = document.getElementById('ranked-tournament-countdown');
    if (countdownEl) countdownEl.classList.add('hidden');
}

/**
 * Start all ranked battles simultaneously (called by host after countdown)
 */
async function startAllRankedBattles() {
    try {
        const result = await apiCall('api/tournament.php', {
            action: 'start_all_matches',
            room_code: GameState.roomCode,
            player_id: GameState.playerId
        });
        
        if (result.success) {
            if (result.already_started) {
                console.log('[Ranked] Battles already started by another client');
            } else {
                console.log('[Ranked] All battles started successfully');
            }
        } else {
            console.error('[Ranked] Failed to start all battles:', result.error);
            showToast('Erro ao iniciar batalhas', 'error');
        }
    } catch (error) {
        console.error('[Ranked] Error starting all battles:', error);
    }
}

/**
 * Auto-complete tournament in ranked mode (any player can call)
 */
async function rankedCompleteTournament() {
    try {
        const result = await apiCall('api/tournament.php', {
            action: 'ranked_complete_tournament',
            room_code: GameState.roomCode,
            player_id: GameState.playerId
        });
        
        if (result.success) {
            if (result.game_finished) {
                showToast(`🏆 ${result.winner.name} venceu o jogo!`, 'success');
            } else if (result.tiebreaker) {
                showToast('🔥 DESEMPATE!', 'warning');
            } else {
                showToast(`Avançando para a Rota ${result.new_route}!`, 'success');
            }
        }
    } catch (error) {
        console.error('[Ranked] Error completing tournament:', error);
    }
}

/**
 * Render the ranked bracket side panel during battle
 */
function renderRankedBracketPanel(bracketSummary) {
    const panel = document.getElementById('ranked-bracket-panel');
    const list = document.getElementById('ranked-bracket-list');
    if (!panel || !list) return;
    
    panel.classList.remove('hidden');
    
    // Add class to battle container for layout adjustment
    const battleContainer = document.querySelector('.battle-container');
    if (battleContainer) battleContainer.classList.add('has-ranked-panel');
    
    list.innerHTML = '';
    
    bracketSummary.forEach(bracket => {
        const entry = document.createElement('div');
        entry.className = 'ranked-bracket-entry';
        
        const isMyMatch = (bracket.player1?.id == GameState.playerId || bracket.player2?.id == GameState.playerId);
        if (isMyMatch) entry.classList.add('is-my-match');
        if (bracket.status === 'completed') entry.classList.add('completed');
        
        const p1Name = bracket.player1?.name || '???';
        const p2Name = bracket.player2?.name || '???';
        const p1Class = bracket.winner_id ? (bracket.winner_id == bracket.player1?.id ? 'winner' : 'loser') : '';
        const p2Class = bracket.winner_id ? (bracket.winner_id == bracket.player2?.id ? 'winner' : 'loser') : '';
        
        let statusHtml = '';
        if (bracket.status === 'completed') {
            statusHtml = '<span class="bracket-entry-status completed">✅ Concluída</span>';
        } else if (bracket.status === 'in_progress') {
            statusHtml = '<span class="bracket-entry-status in-progress">⚔️ Em andamento</span>';
        } else {
            statusHtml = '<span class="bracket-entry-status">⏳ Pendente</span>';
        }
        
        entry.innerHTML = `
            <div class="bracket-entry-players">
                <div class="bracket-entry-player ${p1Class}">${isMyMatch && bracket.player1?.id == GameState.playerId ? '👉 ' : ''}${p1Name}</div>
                <div class="bracket-entry-vs">vs</div>
                <div class="bracket-entry-player ${p2Class}">${isMyMatch && bracket.player2?.id == GameState.playerId ? '👉 ' : ''}${p2Name}</div>
            </div>
            ${statusHtml}
        `;
        
        list.appendChild(entry);
    });
}

/**
 * Hide the ranked bracket side panel
 */
function hideRankedBracketPanel() {
    const panel = document.getElementById('ranked-bracket-panel');
    if (panel) panel.classList.add('hidden');
    const battleContainer = document.querySelector('.battle-container');
    if (battleContainer) battleContainer.classList.remove('has-ranked-panel');
}

/**
 * Show the ranked waiting overlay (when your battle is done but others aren't)
 */
function showRankedWaitingOverlay(bracketSummary) {
    const overlay = document.getElementById('ranked-waiting-overlay');
    const bracketsContainer = document.getElementById('ranked-waiting-brackets');
    if (!overlay || !bracketsContainer) return;
    
    overlay.classList.remove('hidden');
    BattleState.rankedWaiting = true;
    
    // Render bracket status in the waiting overlay
    bracketsContainer.innerHTML = '';
    bracketSummary.forEach(bracket => {
        const entry = document.createElement('div');
        entry.className = 'ranked-bracket-entry';
        if (bracket.status === 'completed') entry.classList.add('completed');
        
        const p1Name = bracket.player1?.name || '???';
        const p2Name = bracket.player2?.name || '???';
        const p1Class = bracket.winner_id ? (bracket.winner_id == bracket.player1?.id ? 'winner' : 'loser') : '';
        const p2Class = bracket.winner_id ? (bracket.winner_id == bracket.player2?.id ? 'winner' : 'loser') : '';
        
        let statusText = bracket.status === 'completed' ? '✅' : '⚔️';
        
        entry.innerHTML = `
            <div class="bracket-entry-players">
                <div class="bracket-entry-player ${p1Class}">${p1Name}</div>
                <div class="bracket-entry-vs">vs</div>
                <div class="bracket-entry-player ${p2Class}">${p2Name}</div>
            </div>
            <div class="bracket-entry-status ${bracket.status === 'completed' ? 'completed' : 'in-progress'}">${statusText}</div>
        `;
        
        bracketsContainer.appendChild(entry);
    });
}

/**
 * Hide the ranked waiting overlay
 */
function hideRankedWaitingOverlay() {
    const overlay = document.getElementById('ranked-waiting-overlay');
    if (overlay) overlay.classList.add('hidden');
    BattleState.rankedWaiting = false;
    stopRankedBracketPolling();
}

/**
 * Handle ranked battle SSE/WS events.
 * In ranked mode, all battles run simultaneously — each client receives events for ALL matches.
 * This function filters by match_index so only events for THIS player's match update the battle UI.
 * Events for OTHER matches update the bracket side panel.
 */
function handleRankedBattleEvent(eventType, data) {
    console.log('[Ranked] Battle event:', eventType, 'match_index:', data.match_index, 'myMatch:', BattleState.myMatchIndex);
    
    const isMyMatch = (data.match_index === BattleState.myMatchIndex);
    
    // Always update bracket summary for side panel regardless of which match the event is for
    updateRankedBracketFromEvent(eventType, data);
    
    // Only process battle UI updates for this player's match
    if (!isMyMatch) {
        console.log('[Ranked] Event for different match, skipping battle UI update');
        return;
    }
    
    // Delegate to the existing battle event handlers
    switch (eventType) {
        case 'pokemon_selected':
            handlePokemonSelected(data);
            break;
        case 'combat_started':
            handleCombatStarted(data);
            break;
        case 'attack':
            handleAttackEvent(data);
            break;
        case 'pokemon_fainted':
            handlePokemonFainted(data);
            break;
        case 'pokemon_sent':
            handlePokemonSent(data);
            break;
        case 'battle_ended':
            handleBattleEnded(data);
            break;
        default:
            console.log('[Ranked] Unknown ranked battle event:', eventType);
    }
}

/**
 * Update the ranked bracket side panel from a live battle event.
 * This keeps the bracket panel updated in real-time as other battles progress.
 */
function updateRankedBracketFromEvent(eventType, data) {
    if (!BattleState.bracketSummary || !Array.isArray(BattleState.bracketSummary)) return;
    
    const matchIndex = data.match_index;
    const bracket = BattleState.bracketSummary.find(b => b.match_index === matchIndex);
    if (!bracket) return;
    
    switch (eventType) {
        case 'combat_started':
            bracket.status = 'in_progress';
            break;
        case 'battle_ended':
            bracket.status = 'completed';
            bracket.winner_id = data.winner_id;
            break;
    }
    
    // Re-render the bracket panel
    renderRankedBracketPanel(BattleState.bracketSummary);
    
    // If we're in waiting state, update that overlay too
    if (BattleState.rankedWaiting) {
        showRankedWaitingOverlay(BattleState.bracketSummary);
        
        // Check if all matches are now complete
        const allComplete = BattleState.bracketSummary.every(b => b.status === 'completed');
        if (allComplete) {
            console.log('[Ranked] All battles complete (from live event)');
            hideRankedWaitingOverlay();
            hideRankedBracketPanel();
            setTimeout(() => {
                handleGameStateChange('tournament');
                refreshTournamentState();
            }, 2000);
        }
    }
}

/**
 * Start polling bracket status for ranked mode (when waiting for other battles)
 */
function startRankedBracketPolling() {
    stopRankedBracketPolling();
    BattleState._rankedPollInterval = setInterval(() => {
        refreshRankedBracketStatus();
    }, 3000);
}

/**
 * Stop ranked bracket polling
 */
function stopRankedBracketPolling() {
    if (BattleState._rankedPollInterval) {
        clearInterval(BattleState._rankedPollInterval);
        BattleState._rankedPollInterval = null;
    }
}

/**
 * Update the ranked bracket panel and waiting overlay with fresh data
 */
async function refreshRankedBracketStatus() {
    if (!BattleState.isRankedMode) return;
    
    try {
        const result = await apiCall(
            `api/tournament.php?action=get_my_battle_state&room_code=${GameState.roomCode}&player_id=${GameState.playerId}`,
            {}, 'GET'
        );
        
        if (result.success && result.bracket_summary) {
            BattleState.bracketSummary = result.bracket_summary;
            renderRankedBracketPanel(result.bracket_summary);
            
            // If we're waiting, update the waiting overlay too
            if (BattleState.rankedWaiting) {
                showRankedWaitingOverlay(result.bracket_summary);
            }
            
            // Check if all matches are complete
            if (result.all_matches_complete) {
                hideRankedWaitingOverlay();
                hideRankedBracketPanel();
                // Transition back to tournament
                setTimeout(() => {
                    handleGameStateChange('tournament');
                    refreshTournamentState();
                }, 2000);
            }
        }
    } catch (error) {
        console.debug('[Ranked] Error refreshing bracket status:', error);
    }
}

// ============================================
// END TOURNAMENT PHASE FUNCTIONS
// ============================================

// ============================================
// BATTLE PHASE FUNCTIONS
// ============================================

/**
 * Initialize Battle Phase
 */
async function initBattlePhase() {
    console.log('Initializing Battle Phase...');
    console.log('GameState.roomCode:', GameState.roomCode);
    
    // Clear any existing auto-turn timer
    if (BattleState.autoTurnTimer) {
        clearTimeout(BattleState.autoTurnTimer);
        BattleState.autoTurnTimer = null;
    }
    
    // Hide any ranked overlays from previous battles
    hideRankedWaitingOverlay();
    
    // Reset battle log display
    if (DOM.battleLogMessages) {
        DOM.battleLogMessages.innerHTML = '';
    } else {
        console.error('DOM.battleLogMessages not found!');
    }
    
    // Determine if this is ranked mode
    const isRanked = GameState.gameMode === 'ranked' || TournamentState.gameMode === 'ranked';
    BattleState.isRankedMode = isRanked;
    
    // Fetch current battle state
    try {
        console.log('Fetching battle state... (ranked:', isRanked, ')');
        
        // In ranked mode, use get_my_battle_state to get this player's specific battle
        const apiAction = isRanked ? 'get_my_battle_state' : 'get_battle_state';
        const result = await apiCall(
            `${API.tournament}?action=${apiAction}&room_code=${GameState.roomCode}&player_id=${GameState.playerId}`,
            {}, 'GET'
        );
        
        console.log('Battle state result:', result);
        
        if (!result.success) {
            console.error('Battle state fetch failed:', result.error);
            // In ranked mode, if no battle found, player might be waiting (bye)
            if (isRanked && result.waiting) {
                addBattleLog('Você não tem uma batalha nesta rodada. Aguardando...');
                showRankedWaitingOverlay(BattleState.bracketSummary || []);
                return;
            }
            showToast(result.error || 'Falha ao carregar batalha', 'error');
            return;
        }
        
        const battleState = result.battle_state;
        
        // Store NPC battle info
        BattleState.isNpcBattle = result.is_npc_battle || battleState.is_npc_battle || false;
        BattleState.npcData = result.npc_data || battleState.npc_data || null;
        
        // In ranked mode, store the match index
        if (isRanked) {
            BattleState.myMatchIndex = result.match_index;
            TournamentState.myMatchIndex = result.match_index;
            BattleState.bracketSummary = result.bracket_summary || [];
            // Show the bracket side panel
            renderRankedBracketPanel(BattleState.bracketSummary);
        } else {
            hideRankedBracketPanel();
        }
        
        // Determine if we are a participant (player1 is always human in NPC battles)
        BattleState.isMyBattle = (GameState.playerId == battleState.player1_id || 
                                   (!BattleState.isNpcBattle && GameState.playerId == battleState.player2_id));
        BattleState.amPlayer1 = (GameState.playerId == battleState.player1_id);
        
        // Store state
        BattleState.player1 = result.player1;
        BattleState.player2 = result.player2;
        BattleState.player1Team = battleState.player1_team;
        BattleState.player2Team = battleState.player2_team;
        BattleState.player1Active = battleState.player1_active;
        BattleState.player2Active = battleState.player2_active;
        BattleState.player1HasSelected = battleState.player1_has_selected || (battleState.player1_active !== null);
        BattleState.player2HasSelected = battleState.player2_has_selected || (battleState.player2_active !== null);
        BattleState.phase = battleState.phase;
        BattleState.currentTurn = battleState.current_turn;
        BattleState.turnNumber = battleState.turn_number;
        BattleState.battleLog = battleState.battle_log || [];
        BattleState.typeMatchups = result.type_matchups || null;
        
        // Render initial battle UI
        renderBattleHeader();
        renderBattleArena();
        renderBattleTeamPreviews();
        updateBattleStatus();
        
        // Show selection panel if in selection phase and we're a participant
        if (battleState.phase === 'selection' && BattleState.isMyBattle) {
            const myHasSelected = BattleState.amPlayer1 
                ? BattleState.player1HasSelected 
                : BattleState.player2HasSelected;
            
            if (!myHasSelected) {
                showPokemonSelectionPanel(false, battleState.selection_deadline || null);
            } else {
                showWaitingForOpponent();
            }
        } else if (battleState.phase === 'selection' && !BattleState.isMyBattle) {
            // Spectator - hide selection panel, show spectator message
            hidePokemonSelectionPanel();
            addBattleLog('Você está assistindo esta batalha.');
        } else if (battleState.phase === 'battle') {
            hidePokemonSelectionPanel();
            // Start auto-battle if we're in battle phase
            if (BattleState.isMyBattle) {
                scheduleNextTurn();
            }
        }
        
        // Build opponent name (handle NPC)
        const opponentName = BattleState.isNpcBattle 
            ? `${result.player2.name} (${result.player2.title || 'Líder de Ginásio'})`
            : result.player2.name;
        
        addBattleLog(`Batalha iniciada: ${result.player1.name} vs ${opponentName}!`);
        
        // Show NPC intro message
        if (BattleState.isNpcBattle && BattleState.npcData) {
            setTimeout(() => {
                addBattleLog(`🏟️ ${BattleState.npcData.name}: "Prepare-se para o desafio!"`, 'npc');
            }, 500);
        }
        
    } catch (error) {
        console.error('Error initializing battle:', error);
        showToast('Erro ao carregar batalha', 'error');
    }
}

/**
 * Render battle header with player info
 */
function renderBattleHeader() {
    console.log('renderBattleHeader called', {
        player1: BattleState.player1,
        player2: BattleState.player2,
        DOM_P1Avatar: !!DOM.battleP1Avatar,
        DOM_P1Name: !!DOM.battleP1Name
    });
    
    // Player 1 is always a real player
    if (DOM.battleP1Avatar) DOM.battleP1Avatar.textContent = AVATARS[BattleState.player1?.avatar - 1] || '😎';
    if (DOM.battleP1Name) DOM.battleP1Name.textContent = BattleState.player1?.name || 'Jogador 1';
    
    // Player 2 might be an NPC gym leader
    const isNpcBattle = BattleState.player2?.is_npc || BattleState.isNpcBattle;
    if (isNpcBattle) {
        if (DOM.battleP2Avatar) DOM.battleP2Avatar.textContent = BattleState.player2?.avatar || '🏆';
        if (DOM.battleP2Name) {
            const npcName = BattleState.player2?.name || 'Líder de Ginásio';
            const npcTitle = BattleState.player2?.title || '';
            DOM.battleP2Name.innerHTML = npcTitle 
                ? `<span class="npc-name">${npcName}</span><br><small class="npc-title">${npcTitle}</small>`
                : `<span class="npc-name">${npcName}</span>`;
        }
    } else {
        if (DOM.battleP2Avatar) DOM.battleP2Avatar.textContent = AVATARS[BattleState.player2?.avatar - 1] || '😎';
        if (DOM.battleP2Name) DOM.battleP2Name.textContent = BattleState.player2?.name || 'Jogador 2';
    }
}

/**
 * Render the battle arena with active Pokemon
 * During selection phase, hide opponent's choice until both have selected
 */
function renderBattleArena() {
    const inSelectionPhase = BattleState.phase === 'selection';
    
    // Player 1 Pokemon
    const p1Pokemon = BattleState.player1Active !== null 
        ? BattleState.player1Team[BattleState.player1Active] 
        : null;
    
    // Should we show Player 1's Pokemon?
    // Show if: battle phase, OR we ARE player 1, OR both have selected
    const showP1Pokemon = !inSelectionPhase || BattleState.amPlayer1 || 
        (BattleState.player1Active !== null && BattleState.player2Active !== null);
    
    if (p1Pokemon && showP1Pokemon) {
        if (DOM.battleP1Sprite) {
            DOM.battleP1Sprite.src = p1Pokemon.sprite_url || '';
            DOM.battleP1Sprite.alt = p1Pokemon.name;
            DOM.battleP1Sprite.classList.toggle('fainted', p1Pokemon.is_fainted);
            DOM.battleP1Sprite.classList.remove('hidden-selection');
        }
        if (DOM.battleP1PokemonName) DOM.battleP1PokemonName.textContent = p1Pokemon.name;
        updateHpBar('p1', p1Pokemon.current_hp, p1Pokemon.battle_hp);
        updatePokemonStats('p1', p1Pokemon);
    } else if (inSelectionPhase && BattleState.player1HasSelected) {
        // Player 1 has selected but we can't see it yet
        if (DOM.battleP1Sprite) {
            DOM.battleP1Sprite.src = '';
            DOM.battleP1Sprite.classList.add('hidden-selection');
        }
        if (DOM.battleP1PokemonName) DOM.battleP1PokemonName.textContent = '???';
        if (DOM.battleP1HpBar) DOM.battleP1HpBar.style.width = '100%';
        if (DOM.battleP1HpText) DOM.battleP1HpText.textContent = '???';
        clearPokemonStats('p1');
    } else {
        if (DOM.battleP1Sprite) {
            DOM.battleP1Sprite.src = '';
            DOM.battleP1Sprite.classList.remove('hidden-selection');
        }
        if (DOM.battleP1PokemonName) DOM.battleP1PokemonName.textContent = '---';
        if (DOM.battleP1HpBar) DOM.battleP1HpBar.style.width = '0%';
        if (DOM.battleP1HpText) DOM.battleP1HpText.textContent = '-/-';
        clearPokemonStats('p1');
    }
    
    // Player 2 Pokemon
    const p2Pokemon = BattleState.player2Active !== null 
        ? BattleState.player2Team[BattleState.player2Active] 
        : null;
    
    // Should we show Player 2's Pokemon?
    // Show if: battle phase, OR we ARE player 2, OR both have selected
    const showP2Pokemon = !inSelectionPhase || !BattleState.amPlayer1 || 
        (BattleState.player1Active !== null && BattleState.player2Active !== null);
    
    if (p2Pokemon && showP2Pokemon) {
        if (DOM.battleP2Sprite) {
            DOM.battleP2Sprite.src = p2Pokemon.sprite_url || '';
            DOM.battleP2Sprite.alt = p2Pokemon.name;
            DOM.battleP2Sprite.classList.toggle('fainted', p2Pokemon.is_fainted);
            DOM.battleP2Sprite.classList.remove('hidden-selection');
        }
        if (DOM.battleP2PokemonName) DOM.battleP2PokemonName.textContent = p2Pokemon.name;
        updateHpBar('p2', p2Pokemon.current_hp, p2Pokemon.battle_hp);
        updatePokemonStats('p2', p2Pokemon);
    } else if (inSelectionPhase && BattleState.player2HasSelected) {
        // Player 2 has selected but we can't see it yet
        if (DOM.battleP2Sprite) {
            DOM.battleP2Sprite.src = '';
            DOM.battleP2Sprite.classList.add('hidden-selection');
        }
        if (DOM.battleP2PokemonName) DOM.battleP2PokemonName.textContent = '???';
        if (DOM.battleP2HpBar) DOM.battleP2HpBar.style.width = '100%';
        if (DOM.battleP2HpText) DOM.battleP2HpText.textContent = '???';
        clearPokemonStats('p2');
    } else {
        if (DOM.battleP2Sprite) {
            DOM.battleP2Sprite.src = '';
            DOM.battleP2Sprite.classList.remove('hidden-selection');
        }
        if (DOM.battleP2PokemonName) DOM.battleP2PokemonName.textContent = '---';
        if (DOM.battleP2HpBar) DOM.battleP2HpBar.style.width = '0%';
        if (DOM.battleP2HpText) DOM.battleP2HpText.textContent = '-/-';
        clearPokemonStats('p2');
    }
}

/**
 * Update HP bar for a player's Pokemon
 */
function updateHpBar(player, currentHp, maxHp) {
    const hpBar = player === 'p1' ? DOM.battleP1HpBar : DOM.battleP2HpBar;
    const hpText = player === 'p1' ? DOM.battleP1HpText : DOM.battleP2HpText;
    
    if (!hpBar || !hpText) return;
    
    const percentage = Math.max(0, (currentHp / maxHp) * 100);
    hpBar.style.width = `${percentage}%`;
    hpText.textContent = `${currentHp}/${maxHp}`;
    
    // Update HP bar color based on percentage
    hpBar.classList.remove('medium', 'low');
    if (percentage <= 20) {
        hpBar.classList.add('low');
    } else if (percentage <= 50) {
        hpBar.classList.add('medium');
    }
}

/**
 * Update stats display for a player's active Pokemon
 */
function updatePokemonStats(player, pokemon) {
    const attackEl = player === 'p1' ? DOM.battleP1Attack : DOM.battleP2Attack;
    const speedEl = player === 'p1' ? DOM.battleP1Speed : DOM.battleP2Speed;
    const typeAtkEl = player === 'p1' ? DOM.battleP1TypeAtk : DOM.battleP2TypeAtk;
    const typeDefEl = player === 'p1' ? DOM.battleP1TypeDef : DOM.battleP2TypeDef;
    const statsContainer = player === 'p1' ? DOM.battleP1Stats : DOM.battleP2Stats;
    
    // Show stats container
    if (statsContainer) statsContainer.classList.remove('hidden');
    
    // Calculate base damage: ceil(ATK * 0.1)
    const rawAtk = pokemon.attack || pokemon.base_attack || 0;
    const baseDamage = Math.ceil(rawAtk * 0.1);
    
    // Update base damage and speed values
    if (attackEl) attackEl.textContent = baseDamage || '?';
    if (speedEl) speedEl.textContent = pokemon.speed || pokemon.base_speed || '?';
    
    // Update type badges with emoji prefix and proper styling
    if (typeAtkEl) {
        const atkType = pokemon.type_atk || pokemon.type_attack || pokemon.attack_type || '???';
        typeAtkEl.textContent = `⚔️ ${atkType}`;
        typeAtkEl.className = `type-badge ${atkType.toLowerCase()}`;
    }
    
    if (typeDefEl) {
        const defType = pokemon.type_def || pokemon.type_defense || pokemon.defense_type || '???';
        typeDefEl.textContent = `🛡️ ${defType}`;
        typeDefEl.className = `type-badge ${defType.toLowerCase()}`;
    }
}

/**
 * Clear stats display for a player's Pokemon
 */
function clearPokemonStats(player) {
    const attackEl = player === 'p1' ? DOM.battleP1Attack : DOM.battleP2Attack;
    const speedEl = player === 'p1' ? DOM.battleP1Speed : DOM.battleP2Speed;
    const typeAtkEl = player === 'p1' ? DOM.battleP1TypeAtk : DOM.battleP2TypeAtk;
    const typeDefEl = player === 'p1' ? DOM.battleP1TypeDef : DOM.battleP2TypeDef;
    const statsContainer = player === 'p1' ? DOM.battleP1Stats : DOM.battleP2Stats;
    
    // Hide or reset stats
    if (statsContainer) statsContainer.classList.add('hidden');
    
    if (attackEl) attackEl.textContent = '-';
    if (speedEl) speedEl.textContent = '-';
    
    if (typeAtkEl) {
        typeAtkEl.textContent = '---';
        typeAtkEl.className = 'type-badge';
    }
    
    if (typeDefEl) {
        typeDefEl.textContent = '---';
        typeDefEl.className = 'type-badge';
    }
}

/**
 * Render team preview icons
 */
function renderBattleTeamPreviews() {
    // Player 1 team
    if (DOM.battleP1Team) {
        DOM.battleP1Team.innerHTML = '';
        BattleState.player1Team.forEach((pokemon, index) => {
            const icon = createTeamIcon(pokemon, index === BattleState.player1Active);
            DOM.battleP1Team.appendChild(icon);
        });
    }
    
    // Player 2 team
    if (DOM.battleP2Team) {
        DOM.battleP2Team.innerHTML = '';
        BattleState.player2Team.forEach((pokemon, index) => {
            const icon = createTeamIcon(pokemon, index === BattleState.player2Active);
            DOM.battleP2Team.appendChild(icon);
        });
    }
}

/**
 * Create a team Pokemon icon
 */
function createTeamIcon(pokemon, isActive) {
    const icon = document.createElement('div');
    icon.className = 'team-pokemon-icon';
    if (isActive) icon.classList.add('active');
    if (pokemon.is_fainted) icon.classList.add('fainted');
    
    const img = document.createElement('img');
    img.src = pokemon.sprite_url || '';
    img.alt = pokemon.name;
    icon.appendChild(img);
    
    return icon;
}

/**
 * Update battle status display
 */
function updateBattleStatus() {
    if (!DOM.battleStatus) return;
    
    if (BattleState.phase === 'selection') {
        if (BattleState.isMyBattle) {
            const myHasSelected = BattleState.amPlayer1 ? BattleState.player1HasSelected : BattleState.player2HasSelected;
            const opponentHasSelected = BattleState.amPlayer1 ? BattleState.player2HasSelected : BattleState.player1HasSelected;
            
            if (!myHasSelected) {
                DOM.battleStatus.textContent = 'Escolha seu Pokémon!';
                DOM.battleStatus.className = 'battle-status your-turn';
            } else if (!opponentHasSelected) {
                DOM.battleStatus.textContent = 'Aguardando oponente escolher...';
                DOM.battleStatus.className = 'battle-status waiting';
            } else {
                DOM.battleStatus.textContent = 'Ambos prontos! Batalha iniciando...';
                DOM.battleStatus.className = 'battle-status';
            }
        } else {
            // Spectator view
            const p1Selected = BattleState.player1HasSelected;
            const p2Selected = BattleState.player2HasSelected;
            
            if (!p1Selected && !p2Selected) {
                DOM.battleStatus.textContent = '👁️ Assistindo - Jogadores estão escolhendo...';
            } else if (p1Selected && !p2Selected) {
                DOM.battleStatus.textContent = `👁️ ${BattleState.player1?.name || 'Jogador 1'} pronto, aguardando ${BattleState.player2?.name || 'Jogador 2'}...`;
            } else if (!p1Selected && p2Selected) {
                DOM.battleStatus.textContent = `👁️ ${BattleState.player2?.name || 'Jogador 2'} pronto, aguardando ${BattleState.player1?.name || 'Jogador 1'}...`;
            } else {
                DOM.battleStatus.textContent = '👁️ Ambos prontos! Batalha iniciando...';
            }
            DOM.battleStatus.className = 'battle-status spectating';
        }
    } else if (BattleState.phase === 'battle') {
        if (BattleState.isMyBattle) {
            const isMyTurn = (BattleState.currentTurn === 'player1' && BattleState.amPlayer1) ||
                (BattleState.currentTurn === 'player2' && !BattleState.amPlayer1);
            
            if (isMyTurn) {
                DOM.battleStatus.textContent = 'Seu Pokémon está atacando!';
                DOM.battleStatus.className = 'battle-status your-turn';
            } else {
                const attackerName = BattleState.currentTurn === 'player1' 
                    ? BattleState.player1.name 
                    : BattleState.player2.name;
                DOM.battleStatus.textContent = `Vez de ${attackerName}...`;
                DOM.battleStatus.className = 'battle-status waiting';
            }
        } else {
            // Spectator view
            const attackerName = BattleState.currentTurn === 'player1' 
                ? BattleState.player1?.name 
                : BattleState.player2?.name;
            DOM.battleStatus.textContent = `👁️ Assistindo - Vez de ${attackerName || 'Jogador'}`;
            DOM.battleStatus.className = 'battle-status spectating';
        }
    } else if (BattleState.phase === 'finished') {
        DOM.battleStatus.textContent = 'Batalha finalizada!';
        DOM.battleStatus.className = 'battle-status';
    }
}

/**
 * Show Pokemon selection panel
 * @param {boolean} isReplacement - Whether this is a replacement selection after a faint
 * @param {number|null} serverDeadline - Unix timestamp from server for timer sync (optional)
 */
function showPokemonSelectionPanel(isReplacement = false, serverDeadline = null) {
    console.log('showPokemonSelectionPanel called', {
        isReplacement,
        hasPanel: !!DOM.battleSelectionPanel,
        hasGrid: !!DOM.battleSelectionGrid,
        amPlayer1: BattleState.amPlayer1,
        player1Team: BattleState.player1Team,
        player2Team: BattleState.player2Team
    });
    
    if (!DOM.battleSelectionPanel || !DOM.battleSelectionGrid) return;
    
    DOM.battleSelectionPanel.classList.remove('hidden', 'waiting');
    DOM.battleSelectionTitle.textContent = isReplacement 
        ? 'Escolha seu próximo Pokémon!' 
        : 'Escolha seu Pokémon!';
    
    // Get my team
    const myTeam = BattleState.amPlayer1 ? BattleState.player1Team : BattleState.player2Team;
    
    DOM.battleSelectionGrid.innerHTML = '';
    myTeam.forEach((pokemon, index) => {
        const card = document.createElement('div');
        card.className = 'battle-select-pokemon';
        
        if (pokemon.is_fainted) {
            card.classList.add('fainted');
        }
        
        // Get type info
        const atkType = pokemon.type_atk || pokemon.type_attack || pokemon.attack_type || '???';
        const defType = pokemon.type_def || pokemon.type_defense || pokemon.defense_type || '???';
        
        // Apply type matchup indicators if available (for replacement selection)
        const matchup = BattleState.typeMatchups ? BattleState.typeMatchups[index] : null;
        let defenseIndicator = '';
        let attackIndicator = '';
        let cardMatchupClass = '';
        
        if (matchup && !pokemon.is_fainted) {
            // Defense matchup styling
            if (matchup.defense_matchup === 'resist') {
                defenseIndicator = ' matchup-good'; // Green - we resist their attack
            } else if (matchup.defense_matchup === 'weak') {
                defenseIndicator = ' matchup-bad'; // Red - we take super effective
            }
            
            // Attack matchup styling
            if (matchup.attack_matchup === 'super_effective') {
                attackIndicator = ' matchup-good'; // Green - we deal super effective
            } else if (matchup.attack_matchup === 'resisted') {
                attackIndicator = ' matchup-bad'; // Red - our attack is resisted
            }
            
            // Overall card styling
            if (matchup.overall === 'advantage') {
                cardMatchupClass = 'matchup-advantage';
            } else if (matchup.overall === 'disadvantage') {
                cardMatchupClass = 'matchup-disadvantage';
            } else if (matchup.overall === 'mixed') {
                cardMatchupClass = 'matchup-mixed';
            }
        }
        
        if (cardMatchupClass) {
            card.classList.add(cardMatchupClass);
        }
        
        card.innerHTML = `
            <img src="${pokemon.sprite_url || ''}" alt="${pokemon.name}">
            <span class="pokemon-name">${pokemon.name}</span>
            <span class="pokemon-hp">${pokemon.is_fainted ? 'Desmaiado' : `HP: ${pokemon.current_hp}/${pokemon.battle_hp}`}</span>
            <div class="pokemon-select-types">
                <span class="type-badge ${atkType.toLowerCase()}${attackIndicator}" title="Tipo de Ataque${matchup ? ` (${matchup.attack_multiplier}x)` : ''}">⚔️ ${atkType}</span>
                <span class="type-badge ${defType.toLowerCase()}${defenseIndicator}" title="Tipo de Defesa${matchup ? ` (${matchup.defense_multiplier}x dano recebido)` : ''}">🛡️ ${defType}</span>
            </div>
        `;
        
        if (!pokemon.is_fainted) {
            card.addEventListener('click', () => selectBattlePokemon(index, isReplacement));
        }
        
        DOM.battleSelectionGrid.appendChild(card);
    });
    
    // Start the 10-second countdown timer (sync with server deadline if available)
    startSelectionTimer(isReplacement, serverDeadline);
}

/**
 * Hide Pokemon selection panel
 */
function hidePokemonSelectionPanel() {
    stopSelectionTimer();
    if (DOM.battleSelectionPanel) {
        DOM.battleSelectionPanel.classList.add('hidden');
    }
}

/**
 * Show waiting for opponent state
 */
function showWaitingForOpponent() {
    stopSelectionTimer();
    if (!DOM.battleSelectionPanel) return;
    
    DOM.battleSelectionPanel.classList.remove('hidden');
    DOM.battleSelectionPanel.classList.add('waiting');
    DOM.battleSelectionTitle.textContent = 'Aguardando oponente selecionar...';
    DOM.battleSelectionGrid.innerHTML = '<p style="color: var(--text-secondary);">Seu Pokémon está pronto!</p>';
}

/**
 * Start the 10-second selection countdown timer (deadline-based).
 * Uses an absolute deadline so the timer stays accurate even when the
 * browser throttles setInterval (e.g. when the tab is in the background).
 * @param {boolean} isReplacement - Whether this is a replacement selection
 * @param {number|null} serverDeadline - Unix timestamp (seconds) from server to sync with (optional)
 */
function startSelectionTimer(isReplacement = false, serverDeadline = null) {
    stopSelectionTimer();

    // Calculate absolute deadline in milliseconds
    if (serverDeadline) {
        BattleState.selectionDeadline = serverDeadline * 1000; // server sends seconds
    } else {
        BattleState.selectionDeadline = Date.now() + 10000; // 10 s from now
    }
    BattleState.selectionIsReplacement = isReplacement;

    // Immediately render the first frame
    tickSelectionTimer();

    // Tick every 250 ms for a responsive display; the deadline math keeps it accurate
    BattleState.selectionTimerInterval = setInterval(() => {
        tickSelectionTimer();
    }, 250);
}

/**
 * Single tick of the selection timer – computes remaining time from deadline.
 */
function tickSelectionTimer() {
    if (!BattleState.selectionDeadline) return;

    const remaining = Math.max(0, BattleState.selectionDeadline - Date.now());
    const secondsLeft = Math.ceil(remaining / 1000); // whole seconds shown to player

    updateTimerDisplay(secondsLeft);

    if (remaining <= 0) {
        stopSelectionTimer();
        autoSelectPokemon(BattleState.selectionIsReplacement);
    }
}

/**
 * Stop the selection countdown timer
 */
function stopSelectionTimer() {
    if (BattleState.selectionTimerInterval) {
        clearInterval(BattleState.selectionTimerInterval);
        BattleState.selectionTimerInterval = null;
    }
    BattleState.selectionDeadline = null;
}

/**
 * Update the visual timer display (circle + text)
 * @param {number} timeLeft - seconds remaining (0–10)
 */
function updateTimerDisplay(timeLeft) {
    if (!DOM.timerProgress || !DOM.timerText) return;
    
    const totalTime = 10;
    const clamped = Math.max(0, Math.min(totalTime, timeLeft));
    const circumference = 2 * Math.PI * 16; // r=16 from SVG
    const offset = circumference * (1 - clamped / totalTime);
    
    DOM.timerProgress.style.strokeDashoffset = offset;
    DOM.timerText.textContent = clamped;
    
    // Remove old classes
    DOM.timerProgress.classList.remove('timer-warning', 'timer-danger');
    DOM.timerText.classList.remove('timer-warning', 'timer-danger');
    
    // Apply warning/danger colors
    if (timeLeft <= 3) {
        DOM.timerProgress.classList.add('timer-danger');
        DOM.timerText.classList.add('timer-danger');
    } else if (timeLeft <= 5) {
        DOM.timerProgress.classList.add('timer-warning');
        DOM.timerText.classList.add('timer-warning');
    }
}

/**
 * Auto-select a random non-fainted Pokemon when timer expires
 */
function autoSelectPokemon(isReplacement) {
    const myTeam = BattleState.amPlayer1 ? BattleState.player1Team : BattleState.player2Team;
    
    // Find all non-fainted Pokemon
    const available = [];
    myTeam.forEach((pokemon, index) => {
        if (!pokemon.is_fainted) {
            available.push(index);
        }
    });
    
    if (available.length === 0) return;
    
    // Pick a random one
    const randomIndex = available[Math.floor(Math.random() * available.length)];
    
    addBattleLog('⏰ Tempo esgotado! Pokémon selecionado automaticamente.', 'info');
    showToast('⏰ Tempo esgotado! Seleção automática.', 'warning');
    
    // Call the selection function
    selectBattlePokemon(randomIndex, isReplacement);
}

/**
 * Select a Pokemon for battle
 */
async function selectBattlePokemon(teamIndex, isReplacement = false) {
    stopSelectionTimer();
    setLoading(true);
    
    try {
        let action, data;
        
        if (BattleState.isRankedMode) {
            // Ranked mode: use ranked-specific API with match_index
            action = isReplacement ? 'ranked_select_replacement' : 'ranked_select_pokemon';
            data = {
                action: action,
                room_code: GameState.roomCode,
                player_id: GameState.playerId,
                team_index: teamIndex,
                match_index: BattleState.myMatchIndex
            };
        } else {
            // Casual mode: use standard API
            action = isReplacement ? 'select_replacement' : 'select_pokemon';
            data = {
                action: action,
                room_code: GameState.roomCode,
                player_id: GameState.playerId,
                team_index: teamIndex
            };
        }
        
        const result = await apiCall(API.tournament, data);
        
        if (result.success) {
            showToast(result.message, 'success');
            
            // Update local state
            if (BattleState.amPlayer1) {
                BattleState.player1Active = teamIndex;
            } else {
                BattleState.player2Active = teamIndex;
            }
            
            renderBattleArena();
            renderBattleTeamPreviews();
            
            if (result.both_selected || result.phase === 'battle') {
                hidePokemonSelectionPanel();
                BattleState.phase = 'battle';
                // The auto-battle will start from SSE events
            } else {
                showWaitingForOpponent();
            }
            
            updateBattleStatus();
        } else {
            showToast(result.error || 'Falha ao selecionar Pokémon', 'error');
        }
    } catch (error) {
        console.error('Error selecting Pokemon:', error);
        showToast('Erro ao selecionar Pokémon', 'error');
    }
    
    setLoading(false);
}

/**
 * Schedule the next turn in auto-battle (1 second delay)
 */
function scheduleNextTurn() {
    if (BattleState.phase !== 'battle') return;
    
    // Clear any existing timer
    if (BattleState.autoTurnTimer) {
        clearTimeout(BattleState.autoTurnTimer);
    }
    
    // Only the player whose turn it is executes the attack
    // Exception: In NPC battles, the human player (always player1) also executes NPC turns
    const isMyTurn = (BattleState.currentTurn === 'player1' && BattleState.amPlayer1) ||
                     (BattleState.currentTurn === 'player2' && !BattleState.amPlayer1);
    
    // In NPC battles, player1 (the human) handles all turn executions
    const shouldExecute = isMyTurn || (BattleState.isNpcBattle && BattleState.amPlayer1);
    
    if (shouldExecute) {
        BattleState.autoTurnTimer = setTimeout(() => {
            executeTurn();
        }, 1000);
    }
}

/**
 * Execute a single turn (attack)
 */
async function executeTurn() {
    if (BattleState.phase !== 'battle') return;
    
    try {
        let data;
        
        if (BattleState.isRankedMode) {
            // Ranked mode: execute turn for specific match
            data = {
                action: 'execute_ranked_turn',
                room_code: GameState.roomCode,
                match_index: BattleState.myMatchIndex
            };
        } else {
            // Casual mode: standard turn execution
            data = {
                action: 'execute_turn',
                room_code: GameState.roomCode
            };
        }
        
        const result = await apiCall(API.tournament, data);
        
        if (result.success) {
            // The SSE events will handle UI updates
            // Update local phase
            BattleState.phase = result.phase;
            
            if (result.needs_selection) {
                // Wait for SSE to handle selection
            } else if (!result.battle_ended) {
                BattleState.currentTurn = result.next_turn;
                // Schedule next turn if we're still in battle
                scheduleNextTurn();
            }
        } else {
            console.error('Turn execution failed:', result.error);
        }
    } catch (error) {
        console.error('Error executing turn:', error);
    }
}

/**
 * Handle battle SSE events
 */
function handleBattleEvent(eventType, data) {
    console.log('Battle event:', eventType, data);
    
    switch (eventType) {
        case 'pokemon_selected':
            handlePokemonSelected(data);
            break;
            
        case 'combat_started':
            handleCombatStarted(data);
            break;
            
        case 'attack':
            handleAttackEvent(data);
            break;
            
        case 'pokemon_fainted':
            handlePokemonFainted(data);
            break;
            
        case 'pokemon_sent':
            handlePokemonSent(data);
            break;
            
        case 'battle_ended':
            handleBattleEnded(data);
            break;
    }
}

/**
 * Handle Pokemon selected event
 */
function handlePokemonSelected(data) {
    // During selection phase, Pokemon names are hidden until both select
    if (data.both_selected) {
        // Both have selected - update BOTH players' active Pokemon
        
        // Update Player 1's active Pokemon
        if (data.player1_active !== undefined && data.player1_active !== null) {
            BattleState.player1Active = data.player1_active;
            BattleState.player1HasSelected = true;
        } else if (data.player1_pokemon) {
            const index = BattleState.player1Team.findIndex(p => p.name === data.player1_pokemon);
            if (index !== -1) BattleState.player1Active = index;
            BattleState.player1HasSelected = true;
        }
        
        // Update Player 2's active Pokemon
        if (data.player2_active !== undefined && data.player2_active !== null) {
            BattleState.player2Active = data.player2_active;
            BattleState.player2HasSelected = true;
        } else if (data.player2_pokemon) {
            const index = BattleState.player2Team.findIndex(p => p.name === data.player2_pokemon);
            if (index !== -1) BattleState.player2Active = index;
            BattleState.player2HasSelected = true;
        }
        
        // Log who just selected (the one who triggered both_selected)
        if (data.pokemon_name) {
            addBattleLog(`${data.player_name} envia ${data.pokemon_name}!`, 'switch');
        }
    } else {
        // Selection made but not revealed yet
        addBattleLog(`${data.player_name} escolheu seu Pokémon!`, 'info');
        
        // Update the "has selected" flag without revealing which Pokemon
        if (data.is_player1) {
            BattleState.player1HasSelected = true;
        } else {
            BattleState.player2HasSelected = true;
        }
    }
    
    renderBattleArena();
    renderBattleTeamPreviews();
    updateBattleStatus();
}

/**
 * Handle combat started event
 */
function handleCombatStarted(data) {
    BattleState.phase = 'battle';
    BattleState.currentTurn = data.first_turn;
    
    // Update active Pokemon indices - prefer direct indices if available
    if (data.player1_active !== undefined && data.player1_active !== null) {
        BattleState.player1Active = data.player1_active;
        BattleState.player1HasSelected = true;
    } else if (data.player1_pokemon) {
        const index = BattleState.player1Team.findIndex(p => p.name === data.player1_pokemon);
        if (index !== -1) {
            BattleState.player1Active = index;
            BattleState.player1HasSelected = true;
        }
    }
    
    if (data.player2_active !== undefined && data.player2_active !== null) {
        BattleState.player2Active = data.player2_active;
        BattleState.player2HasSelected = true;
    } else if (data.player2_pokemon) {
        const index = BattleState.player2Team.findIndex(p => p.name === data.player2_pokemon);
        if (index !== -1) {
            BattleState.player2Active = index;
            BattleState.player2HasSelected = true;
        }
    }
    
    hidePokemonSelectionPanel();
    
    const firstName = data.first_turn === 'player1' ? BattleState.player1.name : BattleState.player2.name;
    addBattleLog(`Batalha começa! ${firstName} ataca primeiro!`);
    
    // Re-render with updated active Pokemon
    renderBattleArena();
    renderBattleTeamPreviews();
    updateBattleStatus();
    
    // Start auto-battle
    if (BattleState.isMyBattle) {
        scheduleNextTurn();
    }
}

/**
 * Handle attack event
 */
function handleAttackEvent(data) {
    // Show damage animation
    const targetDisplay = data.is_player1_attacking ? DOM.battleP2Pokemon : DOM.battleP1Pokemon;
    const attackerDisplay = data.is_player1_attacking ? DOM.battleP1Pokemon : DOM.battleP2Pokemon;
    
    // Get attacker's Pokemon to determine attack type
    const attackerPokemon = data.is_player1_attacking 
        ? BattleState.player1Team[BattleState.player1Active]
        : BattleState.player2Team[BattleState.player2Active];
    
    const attackType = attackerPokemon?.type_attack || 'normal';
    const typeMultiplier = data.type_multiplier || 1;
    
    if (attackerDisplay) {
        attackerDisplay.classList.add('attacking');
        setTimeout(() => attackerDisplay.classList.remove('attacking'), 300);
    }
    
    // Show type-based attack visual effect
    showTypeAttackEffect(attackType, typeMultiplier, data.is_player1_attacking);
    
    if (targetDisplay) {
        setTimeout(() => {
            targetDisplay.classList.add('hit');
            // Add type-specific hit effect class
            targetDisplay.classList.add(`hit-${attackType}`);
            setTimeout(() => {
                targetDisplay.classList.remove('hit');
                targetDisplay.classList.remove(`hit-${attackType}`);
            }, 400);
        }, 200);
    }
    
    // Show action text
    showBattleAction(data.damage, data.type_multiplier);
    
    // Update HP
    if (data.is_player1_attacking) {
        // Player 1 attacked Player 2
        const p2Pokemon = BattleState.player2Team[BattleState.player2Active];
        if (p2Pokemon) {
            p2Pokemon.current_hp = data.defender_hp;
            if (data.fainted) p2Pokemon.is_fainted = true;
        }
        updateHpBar('p2', data.defender_hp, data.defender_max_hp);
    } else {
        // Player 2 attacked Player 1
        const p1Pokemon = BattleState.player1Team[BattleState.player1Active];
        if (p1Pokemon) {
            p1Pokemon.current_hp = data.defender_hp;
            if (data.fainted) p1Pokemon.is_fainted = true;
        }
        updateHpBar('p1', data.defender_hp, data.defender_max_hp);
    }
    
    // Build log message
    let effectText = '';
    if (data.type_multiplier > 1) effectText = " É super efetivo!";
    else if (data.type_multiplier < 1) effectText = " Não é muito efetivo...";
    
    const logClass = data.type_multiplier > 1 ? 'super-effective' : 
                     (data.type_multiplier < 1 ? 'not-effective' : 'attack');
    
    addBattleLog(`${data.attacker_pokemon} causa ${data.damage} de dano em ${data.defender_pokemon}!${effectText}`, logClass);
    
    if (data.fainted) {
        addBattleLog(`${data.defender_pokemon} desmaiou!`, 'faint');
    }
    
    // Update turn and continue
    if (!data.fainted) {
        BattleState.currentTurn = data.is_player1_attacking ? 'player2' : 'player1';
        updateBattleStatus();
        
        // Schedule next turn
        if (BattleState.isMyBattle) {
            scheduleNextTurn();
        }
    }
    
    renderBattleArena();
    renderBattleTeamPreviews();
}

/**
 * Show type-based attack visual effect
 * Creates animated particles/effects based on the attack type
 * Effect intensity varies based on type effectiveness
 */
function showTypeAttackEffect(attackType, typeMultiplier, isPlayer1Attacking) {
    const battleArena = document.querySelector('.battle-arena');
    if (!battleArena) return;
    
    // Determine effect intensity based on type multiplier
    let intensity = 'normal';
    if (typeMultiplier >= 2) intensity = 'super';
    else if (typeMultiplier <= 0.5) intensity = 'weak';
    
    // Create the effect container
    const effectContainer = document.createElement('div');
    effectContainer.className = `type-attack-effect effect-${attackType} intensity-${intensity}`;
    effectContainer.classList.add(isPlayer1Attacking ? 'from-left' : 'from-right');
    
    // Type-specific particle configurations
    const typeConfig = {
        fire: { particles: ['🔥', '💥', '✨'], colors: ['#ff6b35', '#ff4500', '#ffa500'] },
        water: { particles: ['💧', '🌊', '💦'], colors: ['#3498db', '#2980b9', '#5dade2'] },
        grass: { particles: ['🍃', '🌿', '✨'], colors: ['#27ae60', '#2ecc71', '#58d68d'] },
        electric: { particles: ['⚡', '💛', '✨'], colors: ['#f1c40f', '#f39c12', '#fff200'] },
        ice: { particles: ['❄️', '💎', '✨'], colors: ['#74b9ff', '#81ecec', '#dfe6e9'] },
        fighting: { particles: ['👊', '💥', '⭐'], colors: ['#d35400', '#e74c3c', '#c0392b'] },
        poison: { particles: ['☠️', '💀', '💜'], colors: ['#9b59b6', '#8e44ad', '#6c3483'] },
        ground: { particles: ['🪨', '💨', '🟤'], colors: ['#d4a574', '#a0522d', '#8b4513'] },
        flying: { particles: ['🌪️', '💨', '🪶'], colors: ['#85c1e9', '#aed6f1', '#d4e6f1'] },
        psychic: { particles: ['🔮', '💫', '✨'], colors: ['#e91e63', '#f48fb1', '#ce93d8'] },
        bug: { particles: ['🐛', '🦗', '✨'], colors: ['#8bc34a', '#9ccc65', '#aed581'] },
        rock: { particles: ['🪨', '💥', '⬛'], colors: ['#795548', '#8d6e63', '#a1887f'] },
        ghost: { particles: ['👻', '💀', '🌑'], colors: ['#6c5ce7', '#a29bfe', '#574b90'] },
        dragon: { particles: ['🐉', '💜', '✨'], colors: ['#6f42c1', '#7950f2', '#9775fa'] },
        dark: { particles: ['🌑', '💀', '⬛'], colors: ['#2d3436', '#636e72', '#4a4a4a'] },
        steel: { particles: ['⚙️', '🔩', '✨'], colors: ['#95a5a6', '#7f8c8d', '#bdc3c7'] },
        normal: { particles: ['⭐', '💥', '✨'], colors: ['#bdc3c7', '#ecf0f1', '#dfe6e9'] }
    };
    
    const config = typeConfig[attackType] || typeConfig.normal;
    
    // Determine particle count based on intensity
    let particleCount = 5;
    if (intensity === 'super') particleCount = 10;
    else if (intensity === 'weak') particleCount = 3;
    
    // Create particles
    for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('div');
        particle.className = 'attack-particle';
        particle.textContent = config.particles[Math.floor(Math.random() * config.particles.length)];
        
        // Random positioning and animation delay
        const randomY = Math.random() * 60 - 30; // -30 to 30
        const randomDelay = Math.random() * 0.2;
        const randomDuration = 0.4 + Math.random() * 0.3;
        
        particle.style.setProperty('--particle-y', `${randomY}px`);
        particle.style.setProperty('--particle-delay', `${randomDelay}s`);
        particle.style.setProperty('--particle-duration', `${randomDuration}s`);
        particle.style.setProperty('--particle-color', config.colors[Math.floor(Math.random() * config.colors.length)]);
        
        // Size based on intensity
        let size = '1.5rem';
        if (intensity === 'super') size = '2rem';
        else if (intensity === 'weak') size = '1rem';
        particle.style.fontSize = size;
        
        effectContainer.appendChild(particle);
    }
    
    // Add screen flash effect for super effective attacks
    if (intensity === 'super') {
        const flash = document.createElement('div');
        flash.className = `battle-flash flash-${attackType}`;
        battleArena.appendChild(flash);
        setTimeout(() => flash.remove(), 300);
        
        // Add screen shake for super effective hits
        battleArena.classList.add('screen-shake');
        setTimeout(() => battleArena.classList.remove('screen-shake'), 400);
    }
    
    battleArena.appendChild(effectContainer);
    
    // Remove effect after animation completes
    setTimeout(() => effectContainer.remove(), 800);
}

/**
 * Show battle action text (damage dealt)
 */
function showBattleAction(damage, multiplier) {
    if (!DOM.battleActionDisplay || !DOM.battleActionText) return;
    
    DOM.battleActionDisplay.classList.remove('hidden', 'super-effective', 'not-effective', 'critical');
    
    let text = `-${damage}`;
    if (multiplier > 1) {
        text += ' Super Efetivo!';
        DOM.battleActionDisplay.classList.add('super-effective');
    } else if (multiplier < 1) {
        text += ' Pouco Efetivo';
        DOM.battleActionDisplay.classList.add('not-effective');
    }
    
    DOM.battleActionText.textContent = text;
    
    // Hide after 1.5 seconds
    setTimeout(() => {
        DOM.battleActionDisplay.classList.add('hidden');
    }, 1500);
}

/**
 * Handle Pokemon fainted event
 */
async function handlePokemonFainted(data) {
    BattleState.phase = 'selection';
    
    // Check if we need to select a replacement
    if (data.player_id == GameState.playerId && data.needs_selection) {
        // Fetch fresh battle state to get type matchups for the replacement selection
        try {
            // Use ranked or casual API depending on mode
            const apiAction = BattleState.isRankedMode ? 'get_my_battle_state' : 'get_battle_state';
            const result = await apiCall(`${API.tournament}?action=${apiAction}&room_code=${GameState.roomCode}&player_id=${GameState.playerId}`, {}, 'GET');
            if (result.success) {
                BattleState.typeMatchups = result.type_matchups || null;
                // Also update team HP values
                BattleState.player1Team = result.battle_state.player1_team;
                BattleState.player2Team = result.battle_state.player2_team;
            }
        } catch (error) {
            console.error('Error fetching battle state for matchups:', error);
        }
        
        // Use server deadline from the fainted event or from fetched battle state
        const deadline = data.selection_deadline || null;
        showPokemonSelectionPanel(true, deadline);
        updateBattleStatus();
    }
    
    renderBattleArena();
    renderBattleTeamPreviews();
}

/**
 * Handle Pokemon sent event (replacement)
 */
function handlePokemonSent(data) {
    addBattleLog(`${data.player_name} envia ${data.pokemon_name}!`, 'switch');
    
    // Update local state - prefer direct index if available
    if (data.is_player1) {
        if (data.team_index !== undefined && data.team_index !== null) {
            BattleState.player1Active = data.team_index;
        } else {
            const index = BattleState.player1Team.findIndex(p => p.name === data.pokemon_name);
            if (index !== -1) BattleState.player1Active = index;
        }
    } else {
        if (data.team_index !== undefined && data.team_index !== null) {
            BattleState.player2Active = data.team_index;
        } else {
            const index = BattleState.player2Team.findIndex(p => p.name === data.pokemon_name);
            if (index !== -1) BattleState.player2Active = index;
        }
    }
    
    BattleState.phase = 'battle';
    BattleState.currentTurn = data.first_turn;
    
    hidePokemonSelectionPanel();
    renderBattleArena();
    renderBattleTeamPreviews();
    updateBattleStatus();
    
    // Continue auto-battle
    if (BattleState.isMyBattle) {
        scheduleNextTurn();
    }
}

/**
 * Handle battle ended event
 */
function handleBattleEnded(data) {
    BattleState.phase = 'finished';
    
    // Clear auto-turn timer
    if (BattleState.autoTurnTimer) {
        clearTimeout(BattleState.autoTurnTimer);
        BattleState.autoTurnTimer = null;
    }
    
    const isNpcBattle = data.is_npc_battle || BattleState.isNpcBattle;
    const winnerIsNpc = data.winner_is_npc;
    const isWinner = data.winner_id == GameState.playerId;
    
    let message;
    if (isNpcBattle) {
        if (isWinner) {
            message = `🏆 Você derrotou ${data.loser_name}! (+1 Insígnia, +R$2)`;
        } else if (winnerIsNpc) {
            message = `😢 ${data.winner_name} venceu! Talvez na próxima...`;
        } else {
            message = `${data.winner_name} venceu contra o Líder de Ginásio!`;
        }
    } else {
        message = isWinner 
            ? '🏆 Você venceu a batalha! (+1 Insígnia, +R$2)'
            : `${data.winner_name} venceu a batalha!`;
    }
    
    addBattleLog(message, 'victory');
    showToast(message, isWinner ? 'success' : 'info');
    
    // Show NPC dialogue if available
    if (data.npc_dialogue) {
        setTimeout(() => {
            const npcName = isNpcBattle && BattleState.npcData ? BattleState.npcData.name : 'Líder de Ginásio';
            addBattleLog(`🏟️ ${npcName}: "${data.npc_dialogue}"`, 'npc');
        }, 500);
    }
    
    updateBattleStatus();
    
    // In ranked mode, show waiting overlay if other battles are still going
    if (BattleState.isRankedMode) {
        // Update bracket summary with this match's result
        if (BattleState.bracketSummary) {
            const myMatch = BattleState.bracketSummary.find(b => b.match_index === BattleState.myMatchIndex);
            if (myMatch) {
                myMatch.status = 'completed';
                myMatch.winner_id = data.winner_id;
            }
            renderRankedBracketPanel(BattleState.bracketSummary);
        }
        
        // Check if all matches are done
        const allComplete = BattleState.bracketSummary?.every(b => b.status === 'completed');
        
        if (allComplete) {
            // All done — go back to tournament
            setTimeout(() => {
                hideRankedBracketPanel();
                hideRankedWaitingOverlay();
                handleGameStateChange('tournament');
                refreshTournamentState();
            }, 3500);
        } else {
            // Show waiting overlay and start polling for updates
            setTimeout(() => {
                showRankedWaitingOverlay(BattleState.bracketSummary || []);
                // Start polling for bracket updates
                startRankedBracketPolling();
            }, 2000);
        }
    } else {
        // Casual mode: after a delay, return to tournament screen
        setTimeout(() => {
            handleGameStateChange('tournament');
            refreshTournamentState();
        }, 3500);
    }
}

/**
 * Add message to battle log
 */
function addBattleLog(message, type = '') {
    if (!DOM.battleLogMessages) return;
    
    const msgEl = document.createElement('div');
    msgEl.className = `battle-log-message ${type}`;
    msgEl.textContent = message;
    
    DOM.battleLogMessages.appendChild(msgEl);
    DOM.battleLogMessages.scrollTop = DOM.battleLogMessages.scrollHeight;
    
    // Keep log from getting too long
    while (DOM.battleLogMessages.children.length > 50) {
        DOM.battleLogMessages.removeChild(DOM.battleLogMessages.firstChild);
    }
}

/**
 * Clear battle log
 */
function clearBattleLog() {
    if (DOM.battleLogMessages) {
        DOM.battleLogMessages.innerHTML = '';
    }
}

// ============================================
// END BATTLE PHASE FUNCTIONS
// ============================================

// ============================================
// VICTORY SCREEN FUNCTIONS
// ============================================

/**
 * Load and display victory screen
 */
async function loadVictoryScreen() {
    console.log('Loading victory screen...');
    
    try {
        // Try to get game data with winner info
        const result = await apiCall(`${API.room}?action=get_room&room_code=${GameState.roomCode}`, {}, 'GET');
        
        if (result.success && result.room.game_data) {
            const gameData = typeof result.room.game_data === 'string' 
                ? JSON.parse(result.room.game_data) 
                : result.room.game_data;
            
            if (gameData.winner_name) {
                if (DOM.winnerName) {
                    DOM.winnerName.textContent = `🏆 ${gameData.winner_name} Venceu! 🏆`;
                }
                if (DOM.victoryMessage) {
                    const isYou = gameData.winner_id == GameState.playerId;
                    DOM.victoryMessage.textContent = isYou 
                        ? 'Parabéns! Você é o campeão!'
                        : `${gameData.winner_name} se tornou o campeão!`;
                }
            }
        }
    } catch (error) {
        console.error('Error loading victory screen:', error);
    }
}

// ============================================
// END VICTORY SCREEN FUNCTIONS
// ============================================

/**
 * Check for existing session on page load
 * This is a fallback for when restoreBackendSession hasn't reconnected yet
 * (e.g., if the account was restored but no active game was found via restore,
 *  but the PHP session still has room data)
 */
async function checkExistingSession() {
    // If we already reconnected via restoreBackendSession, skip
    if (GameState.roomCode) return;
    
    try {
        // Try to get room state if we have session data
        const result = await apiCall(`${API.room}?action=get_room`, {}, 'GET');
        
        if (result.success && result.room) {
            GameState.roomCode = result.room.room_code;
            GameState.roomId = result.room.id;
            
            // Find our player
            const currentPlayer = result.players.find(p => p.id == result.current_player_id);
            if (currentPlayer) {
                GameState.playerId = currentPlayer.id;
                GameState.playerNumber = parseInt(currentPlayer.player_number);
                GameState.isHost = currentPlayer.is_host;
                GameState.players = result.players;
                
                showToast('Reconectado à sala!', 'success');
                enterLobby();
                handleGameStateChange(result.room.game_state);
            }
        }
    } catch (error) {
        // No existing session, stay on menu
        console.log('No existing session found');
    }
}

/**
 * Utility: Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', init);

// Handle page unload
window.addEventListener('beforeunload', () => {
    disconnectRealtime();
});
