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
    eventSource: null,  // SSE fallback
    webSocket: null,    // WebSocket connection
    wsReconnectAttempts: 0,
    lastEventId: 0,
    // Catching phase state
    catchingState: null,
    wildPokemon: null,
    isMyTurn: false,
    currentRoute: 1,
    encountersRemaining: 0,
    catchAnimationInProgress: false
};
    isMyTurn: false,
    currentRoute: 1,sing emojis for simplicity, can be replaced with images)
    turnsPerPlayer: 8, '🐻‍❄️', '👻', '🐱', '🦊', '🐸', '😈', '🤖', '👽', '💩'];
    myTurnsTaken: 0,
    catchAnimationInProgress: false,le)
    // Timer state
    catchTurnTimer: null,        // setInterval ID for catching turn countdown
    catchTurnTimeLeft: 0,        // seconds remaining in current turn
    townTimer: null,             // setInterval ID for town phase countdown  player1Team: [],
    townTimeLeft: 0,             // seconds remaining in town phase    player2Team: [],
    // Polling/watchdog intervals
    selectionPollInterval: null,
    gameStateWatchdogInterval: null    player1HasSelected: false,
};
', // selection, battle, finished
// Avatar options (using emojis for simplicity, can be replaced with images)ull,
const AVATARS = ['🙂', '🐻‍❄️', '👻', '🐱', '🦊', '🐸', '😈', '🤖', '👽', '💩'];
e,
// Battle State (tracks current battle),
const BattleState = {
    player1: null,
    player2: null,
    player1Team: [],
    player2Team: [],
    player1Active: null,dicators for selection UI
    player2Active: null,null
    player1HasSelected: false,
    player2HasSelected: false,
    phase: 'selection', // selection, battle, finished
    currentTurn: null,
    turnNumber: 0,,
    isMyBattle: false,
    amPlayer1: false,e.php',
    autoTurnTimer: null,
    battleLog: [],ching.php',
    // NPC Battle fields  town: 'api/town.php',
    isNpcBattle: false,    tournament: 'api/tournament.php'
    npcData: null,
    // Type matchup indicators for selection UI
    typeMatchups: nulln
};
 your Node.js WebSocket server URL in production
// API Endpointsws://localhost:3000'
const API = {r-domain.com:3000' or via reverse proxy
    room: 'api/room.php',3000',
    sse: 'api/sse.php',ing SSE mode (works on shared hosting)
    game: 'api/game.php',
    pokemon: 'api/pokemon.php',
    catching: 'api/catching.php',
    town: 'api/town.php',
    tournament: 'api/tournament.php', load)
    account: 'api/account.php',
    ranked: 'api/ranked.php'
};

// WebSocket Configuration
const WS_CONFIG = {
    // Change this URL to your Node.js WebSocket server URL in production
    // For local development: 'ws://localhost:3000'
    // For production: 'wss://your-domain.com:3000' or via reverse proxy  setupAvatarSelectors();
    url: 'wss://poke.labzts.fun/ws',    
    enabled: true,       // ← CHANGE from false to truen
    reconnectDelay: 3000,tingSession();
    maxReconnectAttempts: 10}
};

// DOM Elements (cached on load)Cache frequently used DOM elements
let DOM = {};
OM() {
/**
 * Initialize the game
 */    screens: {
async function init() {
    cacheDOM();en-lobby'),
    setupEventListeners();        initial: document.getElementById('screen-initial'),
    setupAvatarSelectors();
    
    // Check for saved account and restore backend session: document.getElementById('screen-tournament'),
    const hasAccount = await loadSavedAccount();tElementById('screen-battle'),
           victory: document.getElementById('screen-victory')
    // Only check existing PHP session if no account was restored       },
    // (restoreBackendSession already handles reconnection for logged-in users)        // Menu
    if (!hasAccount) {     btnCreateRoom: document.getElementById('btn-create-room'),
        checkExistingSession();entById('btn-join-room'),
    }     createRoomForm: document.getElementById('create-room-form'),
} document.getElementById('join-room-form'),
atePlayerName: document.getElementById('create-player-name'),
/**Name: document.getElementById('join-player-name'),
 * Cache frequently used DOM elementsput: document.getElementById('room-code-input'),
 */nfirm-create'),
function cacheDOM() {l-create'),
    DOM = {in'),
        // Screens,
        screens: {eate-avatar-selector'),
            menu: document.getElementById('screen-menu'),ctor'),
            lobby: document.getElementById('screen-lobby'),
            initial: document.getElementById('screen-initial'),-code'),
            catching: document.getElementById('screen-catching'),nCopyCode: document.getElementById('btn-copy-code'),
            town: document.getElementById('screen-town'),t: document.getElementById('players-list'),
            tournament: document.getElementById('screen-tournament'),
            battle: document.getElementById('screen-battle'),
            victory: document.getElementById('screen-victory')
        },
        // Account
        accountSection: document.getElementById('account-section'),
        loggedInSection: document.getElementById('logged-in-section'),l-turn-indicator'),
        accountCreateView: document.getElementById('account-create-view'),
        accountLoginView: document.getElementById('account-login-view'),
        accountNicknameCreate: document.getElementById('account-nickname-create'),
        accountNicknameLogin: document.getElementById('account-nickname-login'),emaining'),
        accountCode: document.getElementById('account-code'),
        btnAccountLogin: document.getElementById('btn-account-login'),lay'),
        btnAccountCreate: document.getElementById('btn-account-create'),n-placeholder'),
        btnShowLogin: document.getElementById('btn-show-login'),
        btnShowCreate: document.getElementById('btn-show-create'),n-name'),
        btnAccountLogout: document.getElementById('btn-account-logout'),type-def'),
        menuAccountName: document.getElementById('menu-account-name'),
        menuAccountElo: document.getElementById('menu-account-elo'),onAtk: document.getElementById('wild-pokemon-atk'),
        menuAccountAvatar: document.getElementById('menu-account-avatar'),
        codeDisplay: document.getElementById('code-display'),
        btnToggleCode: document.getElementById('btn-toggle-code'),
        accountAvatarSelector: document.getElementById('account-avatar-selector'),dicator'),
        // Rankede'),
        btnRankedQueue: document.getElementById('btn-ranked-queue'),ment.getElementById('btn-catch'),
        rankedQueuePanel: document.getElementById('ranked-queue-panel'),
        rankedQueueStatus: document.getElementById('ranked-queue-status'),
        rankedQueueCount: document.getElementById('ranked-queue-count'),
        btnLeaveQueue: document.getElementById('btn-leave-queue'),
        // LeaderboardgPlayersPanel: document.getElementById('catching-players-panel'),
        btnLeaderboard: document.getElementById('btn-leaderboard'),
        leaderboardPanel: document.getElementById('leaderboard-panel'),
        leaderboardList: document.getElementById('leaderboard-list'),
        btnCloseLeaderboard: document.getElementById('btn-close-leaderboard'),
        // Menu
        btnCreateRoom: document.getElementById('btn-create-room'),
        btnJoinRoom: document.getElementById('btn-join-room'),
        createRoomForm: document.getElementById('create-room-form'),
        joinRoomForm: document.getElementById('join-room-form'),
        createRoomPreviewName: document.getElementById('create-room-preview-name'),kemon-name'),
        roomCodeInput: document.getElementById('room-code-input'),HpBar: document.getElementById('battle-p1-hp-bar'),
        btnConfirmCreate: document.getElementById('btn-confirm-create'),
        btnCancelCreate: document.getElementById('btn-cancel-create'),),
        btnConfirmJoin: document.getElementById('btn-confirm-join'),ts'),
        btnCancelJoin: document.getElementById('btn-cancel-join'),tack'),
        // Lobby),
        displayRoomCode: document.getElementById('display-room-code'),-atk'),
        btnCopyCode: document.getElementById('btn-copy-code'),def'),
        playersList: document.getElementById('players-list'),rite: document.getElementById('battle-p2-sprite'),
        playerCount: document.getElementById('player-count'),p2-pokemon-name'),
        btnStartGame: document.getElementById('btn-start-game'),
        btnLeaveRoom: document.getElementById('btn-leave-room'),ext'),
        hostIndicator: document.getElementById('host-indicator'),ument.getElementById('battle-p2-team'),
        // Initial-stats'),
        starterGrid: document.getElementById('starter-grid'),
        initialTurnIndicator: document.getElementById('initial-turn-indicator'),,
        selectedList: document.getElementById('selected-list'),
        // Catching Phase
        routeName: document.getElementById('route-name'),
        encountersRemaining: document.getElementById('encounters-remaining'),splay'),
        routeProgress: document.getElementById('route-progress'),
        wildPokemonDisplay: document.getElementById('wild-pokemon-display'),'),
        wildPokemonPlaceholder: document.getElementById('wild-pokemon-placeholder'),ion-title'),
        wildPokemonImg: document.getElementById('wild-pokemon-img'),on-grid'),
        wildPokemonName: document.getElementById('wild-pokemon-name'),-log-messages'),
        wildPokemonTypeDef: document.getElementById('wild-pokemon-type-def'),pokemon'),
        wildPokemonTypeAtk: document.getElementById('wild-pokemon-type-atk'),n'),
        wildPokemonAtk: document.getElementById('wild-pokemon-atk'),
        wildPokemonSpd: document.getElementById('wild-pokemon-spd'),
        wildHpBar: document.getElementById('wild-hp-bar'),
        wildHpText: document.getElementById('wild-hp-text'),
        wildCatchRate: document.getElementById('wild-catch-rate'),
        wildCatchRateDisplay: document.getElementById('wild-catch-rate-display'),
        catchingTurnIndicator: document.getElementById('catching-turn-indicator'),
        currentTurnName: document.getElementById('current-turn-name'),
        btnCatch: document.getElementById('btn-catch'),
        btnUltraCatch: document.getElementById('btn-ultra-catch'),teners
        btnAttack: document.getElementById('btn-attack'),
        ultraBallCount: document.getElementById('ultra-ball-count'),
        catchingLogMessages: document.getElementById('catching-log-messages'),
        catchingPlayersPanel: document.getElementById('catching-players-panel'),te'));
        // Victoryin'));
        winnerName: document.getElementById('winner-name'),eate'));
        victoryMessage: document.getElementById('victory-message'),join'));
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
        battleP1Speed: document.getElementById('battle-p1-speed'),e));
        battleP1TypeAtk: document.getElementById('battle-p1-type-atk'),rue));
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
        battleLogMessages: document.getElementById('battle-log-messages'),
        battleP1Pokemon: document.getElementById('battle-p1-pokemon'),
        battleP2Pokemon: document.getElementById('battle-p2-pokemon'),
        // Utilityon setupAvatarSelectors() {
        toastContainer: document.getElementById('toast-container'),   [DOM.createAvatarSelector, DOM.joinAvatarSelector].forEach(selector => {
        loadingOverlay: document.getElementById('loading-overlay'),        AVATARS.forEach((avatar, index) => {
        // Floating Leave Button         const option = document.createElement('div');
        btnLeaveGame: document.getElementById('btn-leave-game')Name = 'avatar-option' + (index === 0 ? ' selected' : '');
    };         option.textContent = avatar;
}rId = index + 1;
EventListener('click', () => selectAvatar(option, selector));
/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Account buttons
    DOM.btnAccountLogin?.addEventListener('click', loginAccount);
    DOM.btnAccountCreate?.addEventListener('click', createAccount);
    DOM.btnAccountLogout?.addEventListener('click', logoutAccount);
    DOM.btnShowLogin?.addEventListener('click', showLoginView);
    DOM.btnShowCreate?.addEventListener('click', showCreateView);selector.querySelectorAll('.avatar-option').forEach(opt => opt.classList.remove('selected'));
    t.add('selected');
    // Code reveal toggle
    DOM.btnToggleCode?.addEventListener('click', toggleCodeReveal);
    DOM.codeDisplay?.addEventListener('click', toggleCodeReveal);
    
    // Ranked queue
    DOM.btnRankedQueue?.addEventListener('click', joinRankedQueue);
    DOM.btnLeaveQueue?.addEventListener('click', leaveRankedQueue);
    .createRoomForm.classList.add('hidden');
    // LeaderboardDOM.joinRoomForm.classList.add('hidden');
    DOM.btnLeaderboard?.addEventListener('click', showLeaderboard);
    DOM.btnCloseLeaderboard?.addEventListener('click', () => {
        DOM.leaderboardPanel?.classList.add('hidden');
    });
    
    // Menu buttons
    DOM.btnCreateRoom.addEventListener('click', () => showForm('create'));
    DOM.btnJoinRoom.addEventListener('click', () => showForm('join'));}
    DOM.btnCancelCreate.addEventListener('click', () => hideForm('create'));
    DOM.btnCancelJoin.addEventListener('click', () => hideForm('join'));
    DOM.btnConfirmCreate.addEventListener('click', createRoom);
    DOM.btnConfirmJoin.addEventListener('click', joinRoom);
    
    // Lobby buttons
    DOM.btnCopyCode.addEventListener('click', copyRoomCode);
    DOM.btnStartGame.addEventListener('click', startGame);    DOM.createRoomForm.classList.add('hidden');
    DOM.btnLeaveRoom.addEventListener('click', leaveRoom);
    
    // Floating leave game button (for leaving during any game phase)
    DOM.btnLeaveGame?.addEventListener('click', leaveGameConfirm);
    
    // Catching phase buttons
    DOM.btnCatch?.addEventListener('click', () => attemptCatch(false));
    DOM.btnUltraCatch?.addEventListener('click', () => attemptCatch(true));
    DOM.btnAttack?.addEventListener('click', attackWildPokemon);{
    
    // Keyboard shortcuts for catching phasee('hidden');
    document.addEventListener('keydown', handleCatchingKeyboard);lse {
           DOM.loadingOverlay.classList.add('hidden');
    // Enter key for forms    }
    DOM.roomCodeInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') joinRoom();
    });
}

/**, type = 'info', duration = 3000) {
 * Setup avatar selector options (account creation only)('div');
 */
function setupAvatarSelectors() {
    const selector = DOM.accountAvatarSelector;oast);
    if (!selector) return;
    AVATARS.forEach((avatar, index) => {
        const option = document.createElement('div');eIn 0.3s ease reverse';
        option.className = 'avatar-option' + (index === 0 ? ' selected' : ''); setTimeout(() => toast.remove(), 300);
        option.textContent = avatar;   }, duration);
        option.dataset.avatarId = index + 1;}
        option.addEventListener('click', () => selectAvatar(option, selector));
        selector.appendChild(option);
    });Switch to a different screen
}

/**h(screen => screen.classList.remove('active'));
 * Select an avatar
 */   GameState.currentScreen = screenName;
function selectAvatar(option, selector) {    
    selector.querySelectorAll('.avatar-option').forEach(opt => opt.classList.remove('selected')); // Show/hide floating leave button based on screen
    option.classList.add('selected');cept menu and victory
    GameState.selectedAvatar = parseInt(option.dataset.avatarId); if (DOM.btnLeaveGame) {
}= 'menu' || screenName === 'victory') {
den');
/**
 * Show form (create or join)        DOM.btnLeaveGame.classList.remove('hidden');
 */
function showForm(type) {
    DOM.createRoomForm.classList.add('hidden');
    DOM.joinRoomForm.classList.add('hidden');
    
    if (type === 'create') {
        DOM.createRoomForm.classList.remove('hidden');
        // Show account name previewveGameConfirm() {
        if (DOM.createRoomPreviewName && GameState.account) {
            const avatarIndex = (GameState.account.avatar_id || 1) - 1;o leave? As the host, this will end the game for everyone!'
            DOM.createRoomPreviewName.textContent = `${AVATARS[avatarIndex] || AVATARS[0]} ${GameState.account.nickname}`;   : 'Are you sure you want to leave the game?';
        }   
    } else {    if (confirm(message)) {
        DOM.joinRoomForm.classList.remove('hidden');     leaveGame();
        DOM.roomCodeInput.focus();
    }
}

/**
 * Hide form
 */
function hideForm(type) {etLoading(true);
    if (type === 'create') {   try {
        DOM.createRoomForm.classList.add('hidden');        // Try to notify the server
    } else {e' }).catch(() => {});
        DOM.joinRoomForm.classList.add('hidden');
    }
}    }
 
// ============================================
// ACCOUNT MANAGEMENT FUNCTIONS disconnectRealtime();
// ============================================ 

/** GameState.roomCode = null;
 * Load saved account from localStoragel;
 */
/**
 * Show the login view and hide the create account view   GameState.isHost = false;
 */    GameState.players = [];
function showLoginView() { GameState.gameState = 'lobby';
    DOM.accountCreateView?.classList.add('hidden');
    DOM.accountLoginView?.classList.remove('hidden'); GameState.wildPokemon = null;
}lse;

/**
 * Show the create account view and hide the login view   GameState.lastEventId = 0;
 */    
function showCreateView() {
    DOM.accountLoginView?.classList.add('hidden');
    DOM.accountCreateView?.classList.remove('hidden');aiu do jogo', 'info');
}

async function loadSavedAccount() {
    const saved = localStorage.getItem('pokefodase_account');
    if (saved) {rom server
        try {
            GameState.account = JSON.parse(saved);() {
            updateAccountUI();
            // Restore backend session and check for active game
            await restoreBackendSession();/ Disconnect real-time connection
            return true;ltime();
        } catch (e) {   
            localStorage.removeItem('pokefodase_account');    // Reset GameState
        } GameState.roomCode = null;
    }
    return false; GameState.playerId = null;
}ll;

/**
 * Save account to localStoragee = 'lobby';
 */   GameState.catchingState = null;
function saveAccount(account) {    GameState.wildPokemon = null;
    GameState.account = account; GameState.isMyTurn = false;
    localStorage.setItem('pokefodase_account', JSON.stringify(account));
    updateAccountUI();
} GameState.lastEventId = 0;

/**;
 * Restore backend PHP session from saved account data
 * Also checks for an active game and reconnects to itset BattleState
 */
async function restoreBackendSession() {
    if (!GameState.account) return;
    tate.player2Team = [];
    try {leState.player1Active = null;
        const result = await apiCall(`${API.account}?action=restore_session`, { = null;
            account_id: GameState.account.id,
            code: GameState.account.coded = false;
        });
        te.currentTurn = null;
        if (result.success) {ate.turnNumber = 0;
            // Update local account data with fresh data from server
            if (result.account) {
                saveAccount(result.account);
            }
            
            // If there's an active game, reconnect to it
            if (result.active_game) {
                console.log('Active game found, reconnecting:', result.active_game);
                GameState.roomCode = result.active_game.room_code;
                GameState.roomId = result.active_game.room_id;ownState !== 'undefined') {
                GameState.playerId = result.active_game.player_id;
                GameState.playerNumber = parseInt(result.active_game.player_number);= 0;
                GameState.isHost = result.active_game.is_host;
                GameState.gameMode = result.active_game.game_mode || 'casual';tate.usedMegaStone = false;
                e.team = [];
                showToast('Reconectado à partida!', 'success');
                enterLobby();
                handleGameStateChange(result.active_game.game_state);
            }
        } else {monForMega = null;
            // Session restore failed — account may be invalid, clear it
            console.warn('Session restore failed:', result.error);
            GameState.account = null;
            localStorage.removeItem('pokefodase_account');
            updateAccountUI();   TournamentState.brackets = [];
        }       TournamentState.byePlayer = null;
    } catch (error) {        TournamentState.currentMatch = null;
        console.error('Error restoring session:', error);     TournamentState.players = [];
        // Don't clear account on network error, might be temporaryetedMatches = 0;
    }     TournamentState.totalMatches = 0;
}rticipant = false;
PlayerId = null;
/**
 * Update account UI elements
 */
function updateAccountUI() {
    if (GameState.account) {
        DOM.accountSection?.classList.add('hidden');
        DOM.loggedInSection?.classList.remove('hidden');
        if (DOM.menuAccountName) DOM.menuAccountName.textContent = GameState.account.nickname;OM.btnLeaveGame.classList.add('hidden');
        if (DOM.menuAccountElo) DOM.menuAccountElo.textContent = `ELO: ${GameState.account.elo}`;
        if (DOM.menuAccountAvatar) {
            const avatarIndex = (GameState.account.avatar_id || 1) - 1;
            DOM.menuAccountAvatar.textContent = AVATARS[avatarIndex] || AVATARS[0];
        }
        // Reset code display to hidden state any forms
        if (DOM.codeDisplay) {e = '';
            DOM.codeDisplay.textContent = '••••••••';= '';
            DOM.codeDisplay.dataset.revealed = 'false';f (DOM.roomCodeInput) DOM.roomCodeInput.value = '';
        }   hideForm('create');
    } else {    hideForm('join');
        DOM.accountSection?.classList.remove('hidden'); 
        DOM.loggedInSection?.classList.add('hidden');
    } console.log('Successfully returned to menu');
}

/**
 * Toggle the visibility of the player's account codeth timeout
 */
function toggleCodeReveal() {= 'POST', timeoutMs = 15000) {
    if (!DOM.codeDisplay || !GameState.account) return;
    const isRevealed = DOM.codeDisplay.dataset.revealed === 'true';ntries(data).forEach(([key, value]) => formData.append(key, value));
    if (isRevealed) {
        DOM.codeDisplay.textContent = '••••••••';
        DOM.codeDisplay.dataset.revealed = 'false';
        DOM.codeDisplay.classList.remove('revealed');eout(() => controller.abort(), timeoutMs);
    } else {
        DOM.codeDisplay.textContent = GameState.account.code;
        DOM.codeDisplay.dataset.revealed = 'true';ait fetch(endpoint, {
        DOM.codeDisplay.classList.add('revealed');       method,
        // Copy to clipboard           body: method === 'POST' ? formData : undefined,
        navigator.clipboard.writeText(GameState.account.code).then(() => {            credentials: 'include',
            showToast('Código copiado!', 'success', 2000);         signal: controller.signal
        }).catch(() => {});
    }     
}

/**gging
 * Create a new account
 */.log('API Response:', endpoint, text.substring(0, 500));
async function createAccount() {   
    const nickname = DOM.accountNicknameCreate?.value?.trim();    // Try to parse as JSON
    if (!nickname || nickname.length < 2) {
        showToast('Nickname deve ter pelo menos 2 caracteres', 'warning');   return JSON.parse(text);
        return;
    }rror('Failed to parse JSON:', text);
    ver returned invalid response' };
    setLoading(true);
    try {
        const result = await apiCall(`${API.account}?action=create`, { 
            nickname,
            avatar_id: GameState.selectedAvatar ole.error('API Timeout:', endpoint);
        });
        if (result.success) {
            saveAccount(result.account);('API Error:', error);
            showToast(`Conta criada! Seu código: ${result.account.code}. Salve!`, 'success', 8000);
        } else {
            showToast(result.error || 'Erro ao criar conta', 'error');
        }
    } catch (error) {
        console.error('Error creating account:', error);* Create a new room
        showToast('Erro ao criar conta', 'error'); */
    } finally {nc function createRoom() {
        setLoading(false);tePlayerName.value.trim() || 'Player 1';
    } 
}

/**
 * Login to an existing account        action: 'create',
 */ame: playerName,
async function loginAccount() {
    const nickname = DOM.accountNicknameLogin?.value?.trim();
    const code = DOM.accountCode?.value?.trim();   
    
    if (!nickname) {
        showToast('Digite seu nickname', 'warning');eState.roomId = result.room_id;
        return;       GameState.playerId = result.player_id;
    }        GameState.playerNumber = result.player_number;
    if (!code || code.length !== 8) {.isHost = result.is_host;
        showToast('Código deve ter 8 dígitos', 'warning');   
        return;
    }
    
    setLoading(true);
    try {
        const result = await apiCall(`${API.account}?action=login`, { nickname, code });
        if (result.success) {howToast('Erro de conexão. Tente novamente.', 'error');
            saveAccount(result.account);
            showToast(`Bem-vindo, ${result.account.nickname}!`, 'success');
        } else {
            showToast(result.error || 'Login falhou', 'error');
        }
    } catch (error) {in an existing room
        console.error('Error logging in:', error);*/
        showToast('Erro ao fazer login', 'error');async function joinRoom() {
    } finally { const roomCode = DOM.roomCodeInput.value.trim().toUpperCase();
        setLoading(false); playerName = DOM.joinPlayerName.value.trim() || 'Player';
    } 
}ode.length !== 6) {
código de sala válido com 6 caracteres', 'warning');
/**
 * Logout
 */
function logoutAccount() {   setLoading(true);
    GameState.account = null;    try {
    localStorage.removeItem('pokefodase_account');'as', playerName);
    updateAccountUI();ait apiCall(API.room, {
    showToast('Desconectado', 'info');
}            room_code: roomCode,
         player_name: playerName,
// ============================================ectedAvatar
// RANKED QUEUE FUNCTIONS     });
// ============================================
ult:', result);
/**
 * Join the ranked matchmaking queueult.success) {
 */       GameState.roomCode = result.room_code;
async function joinRankedQueue() {        GameState.roomId = result.room_id;
    if (!GameState.account) {.playerId = result.player_id;
        showToast('Faça login primeiro!', 'warning');   GameState.playerNumber = result.player_number;
        return;
    }
    ectou à sala!' : 'Entrou na sala!', 'success');
    setLoading(true);
    try {
        const result = await apiCall(`${API.ranked}?action=join_queue`, {}); na sala', 'error');
        if (result.success) {
            if (result.status === 'matched') {
                // Match found! Enter the game
                showToast('Partida encontrada!', 'success');mente.', 'error');
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
            if (DOM.rankedQueueStatus) DOM.rankedQueueStatus.textContent = result.message;State.isHost) {
            if (DOM.rankedQueueCount) {idden');
                const total = result.total_needed || 4;
                DOM.rankedQueueCount.textContent = `${total - result.players_needed}/${total} jogadores`;Indicator.classList.add('hidden');
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
                GameState.gameMode = result.active_game.game_mode || 'ranked';n copyRoomCode() {
                setLoading(false);
                enterLobby();wait navigator.clipboard.writeText(GameState.roomCode);
                handleGameStateChange(result.active_game.game_state);digo copiado!', 'success');
                return;
            }
            showToast(result.error || 'Erro ao entrar na fila', 'error');
        }
    } catch (error) {
        console.error('Error joining ranked queue:', error);**
        showToast('Erro ao entrar na fila ranqueada', 'error'); * Leave the current room
    } finally {
        setLoading(false);) {
    } setLoading(true);
}
PI.room, { action: 'leave' });
/**
 * Leave the ranked queue    
 *// Reset state
async function leaveRankedQueue() {
    stopQueuePolling();
    DOM.rankedQueuePanel?.classList.add('hidden');yerId = null;
    
    try {   GameState.players = [];
        await apiCall(`${API.ranked}?action=leave_queue`, {});       
        showToast('Saiu da fila', 'info');        switchScreen('menu');
    } catch (error) {     showToast('Saiu da sala', 'info');
        console.error('Error leaving queue:', error);
    }     showToast('Erro ao sair da sala', 'error');
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
                if (result.status === 'matched') {iniciar', 'warning');
                    stopQueuePolling();
                    showToast('Partida encontrada!', 'success');
                    GameState.roomCode = result.room_code;
                    GameState.roomId = result.room_id;
                    GameState.playerId = result.player_id;
                    GameState.playerNumber = parseInt(result.player_number);I.room, { action: 'start_game' });
                    GameState.gameMode = 'ranked';
                    DOM.rankedQueuePanel?.classList.add('hidden');ss) {
                    enterLobby();ss');
                } else if (result.status === 'not_in_queue') {
                    stopQueuePolling();
                    DOM.rankedQueuePanel?.classList.add('hidden');(result.error || 'Falha ao iniciar jogo', 'error');
                } else {
                    if (DOM.rankedQueueCount) {error) {
                        const total = result.total_needed || 4;e conexão', 'error');
                        DOM.rankedQueueCount.textContent = `${total - (result.players_needed || 0)}/${total} jogadores`;
                    }ading(false);
                }
            }
        } catch (error) {/**
            console.error('Queue poll error:', error);Refresh room state from server
        }
    }, 3000);nc function refreshRoomState() {
}
te for:', GameState.roomCode);
/**ion=get_room&room_code=${GameState.roomCode}`, {}, 'GET');
 * Stop queue polling
 */   console.log('Room state result:', result);
function stopQueuePolling() {       
    if (GameState.rankedQueueInterval) {        if (result.success) {
        clearInterval(GameState.rankedQueueInterval);         GameState.players = result.players;
        GameState.rankedQueueInterval = null;te.gameState = result.room.game_state;
    }         updateLobbyUI();
}

/**
 * Show leaderboard    } else {
 */   console.error('Failed to get room state:', result.error);
async function showLeaderboard() {
    DOM.leaderboardPanel?.classList.remove('hidden');
    DOM.leaderboardList.innerHTML = '<p>Carregando...</p>';
    
    try {
        const result = await apiCall(`${API.account}?action=leaderboard`, {}, 'GET');
        if (result.success && result.leaderboard) {
            DOM.leaderboardList.innerHTML = result.leaderboard.map((entry, i) => `
                <div class="leaderboard-row ${entry.id == GameState.account?.id ? 'is-self' : ''}">
                    <span class="lb-rank">#${i + 1}</span> {
                    <span class="lb-name">${escapeHtml(entry.nickname)}</span>ist.innerHTML = '';
                    <span class="lb-elo">ELO: ${entry.elo}</span>
                    <span class="lb-games">${entry.games_played} jogos</span>
                </div>.forEach(player => {
            `).join('');
        } else {   card.className = 'player-card';
            DOM.leaderboardList.innerHTML = '<p>Erro ao carregar leaderboard</p>';       if (player.id == GameState.playerId) card.classList.add('is-you');
        }        if (player.is_host) card.classList.add('is-host');
    } catch (error) {
        DOM.leaderboardList.innerHTML = '<p>Erro ao carregar leaderboard</p>';TARS[player.avatar_id - 1] || '😎';
    }
}        card.innerHTML = `
         <div class="player-avatar">${avatarEmoji}</div>
// ============================================er-name">${escapeHtml(player.player_name)}</div>
// END ACCOUNT/RANKED FUNCTIONS         <div class="player-status ${player.is_ready ? 'ready' : ''}">
// ============================================_host ? '👑 Anfitrião' : (player.is_ready ? '✓ Pronto' : 'Aguardando...')}
iv>
/**
 * Show/hide loading overlay
 */
function setLoading(show) {);
    if (show) {   
        DOM.loadingOverlay.classList.remove('hidden');    // Update start button state
    } else { const canStart = GameState.isHost && GameState.players.length >= 2;
        DOM.loadingOverlay.classList.add('hidden');led = !canStart;
    }
}

/**
 * Show toast notification
 */
function showToast(message, type = 'info', duration = 3000) {if (GameState.eventSource) {
    const toast = document.createElement('div');tSource.close();
    toast.className = `toast ${type}`;
    toast.textContent = message;
    DOM.toastContainer.appendChild(toast);${API.sse}?room_code=${GameState.roomCode}`;
       GameState.eventSource = new EventSource(url);
    setTimeout(() => {    
        toast.style.animation = 'slideIn 0.3s ease reverse'; GameState.eventSource.onopen = () => {
        setTimeout(() => toast.remove(), 300);ted');
    }, duration); };
}

/**
 * Switch to a different screen
 */    setTimeout(() => {
function switchScreen(screenName) {
    Object.values(DOM.screens).forEach(screen => screen.classList.remove('active'));
    DOM.screens[screenName].classList.add('active');
    GameState.currentScreen = screenName;
    
    // Show/hide floating leave button based on screen
    // Show on all screens except menu and victory
    if (DOM.btnLeaveGame) {tate.eventSource.addEventListener('connected', (e) => {
        if (screenName === 'menu' || screenName === 'victory') {   console.log('SSE connection confirmed');
            DOM.btnLeaveGame.classList.add('hidden');   });
        } else {    
            DOM.btnLeaveGame.classList.remove('hidden'); GameState.eventSource.addEventListener('player_joined', (e) => {
        }(e.data);
    }     showToast(`${data.data.player_name} entrou!`, 'info');
}

/**
 * Leave game with confirmationft', (e) => {
 */    const data = JSON.parse(e.data);
function leaveGameConfirm() {ata.player_name} saiu`, 'info');
    const message = GameState.isHost tate();
        ? 'Are you sure you want to leave? As the host, this will end the game for everyone!');
        : 'Are you sure you want to leave the game?';   
        GameState.eventSource.addEventListener('player_ready', (e) => {
    if (confirm(message)) {     refreshRoomState();
        leaveGame();
    } 
}dEventListener('player_updated', (e) => {
ate();
/**
 * Force leave the game and return to menu
 */
async function leaveGame() {a = JSON.parse(e.data);
    setLoading(true);
    try {   if (eventData.first_picker_name) {
        // Try to notify the server        showToast(`Jogo iniciado! ${eventData.first_picker_name} escolhe primeiro!`, 'success');
        await apiCall(API.room, { action: 'leave' }).catch(() => {});
    } catch (e) {go iniciado!', 'success');
        // Ignore errors - we're leaving anyway
    }
    });
    // Disconnect real-time connection
    disconnectRealtime();ventListener('starter_selected', (e) => {
    stopSelectionPolling();rse(e.data);
    stopGameStateWatchdog();eState.players.find(p => p.id == data.data.player_id)?.player_name || 'Um jogador';
    scolheu ${data.data.pokemon_name}!`, 'info');
    // Reset all game state
    GameState.roomCode = null;n state if we're on the initial screen
    GameState.roomId = null;n === 'initial') {
    GameState.playerId = null;;
    GameState.playerNumber = null;
    GameState.isHost = false;
    GameState.players = [];
    GameState.gameState = 'lobby';tListener('phase_changed', (e) => {
    GameState.catchingState = null;(e.data);
    GameState.wildPokemon = null;.data || {};
    GameState.isMyTurn = false;    
    GameState.currentRoute = 1;es first in catching phase
    GameState.turnsPerPlayer = 8;_phase === 'catching' && eventData.first_player_name) {
    GameState.myTurnsTaken = 0;de captura! ${eventData.first_player_name} começa!`, 'success');
    GameState.lastEventId = 0;       } else {
                const phaseNames = {
    setLoading(false);             'catching': 'captura',
    switchScreen('menu');
    showToast('Saiu do jogo', 'info');
}             'battle': 'batalha',
': 'fim'
/**
 * Return to menu from victory screen (or any end state)        const phaseName = phaseNames[eventData.new_phase] || eventData.new_phase;
 * Resets all game state and disconnects from serverde ${phaseName}!`, 'success');
 */
function returnToMenu() {ge(eventData.new_phase);
    console.log('Returning to menu...');
    
    // Disconnect real-time connectionrce.addEventListener('state_sync', (e) => {
    disconnectRealtime();e(e.data);
    stopSelectionPolling();e(data.game_state);
    stopGameStateWatchdog();
    
    // Reset GameState
    GameState.roomCode = null;ddEventListener('wild_pokemon_appeared', (e) => {
    GameState.roomId = null;data);
    GameState.playerId = null;ata.pokemon_name} selvagem apareceu!`, 'wild');
    GameState.playerNumber = null;not in the middle of a catch animation
    GameState.isHost = false;mationInProgress) {
    GameState.players = [];e();
    GameState.gameState = 'lobby';
    GameState.catchingState = null;
    GameState.wildPokemon = null;
    GameState.isMyTurn = false;ventListener('catch_attempt', async (e) => {
    GameState.currentRoute = 1;ta);
    GameState.turnsPerPlayer = 8;    const isMyAttempt = data.data.player_id == GameState.playerId;
    GameState.myTurnsTaken = 0;
    GameState.lastEventId = 0;s during animation
    GameState.starters = null;nInProgress = true;
    GameState.selectionState = null;
    r all players
    // Reset BattleState(
    BattleState.player1 = null;
    BattleState.player2 = null;
    BattleState.player1Team = [];
    BattleState.player2Team = [];
    BattleState.player1Active = null;
    BattleState.player2Active = null;
    BattleState.player1HasSelected = false;
    BattleState.player2HasSelected = false;l) {
    BattleState.phase = 'selection';ta.data.player_name} capturou ${data.data.pokemon_name} mas o time está cheio! Recebeu R$2.`, 'success');
    BattleState.currentTurn = null;) {
    BattleState.turnNumber = 0;ta.player_name} usou Ultra Ball e capturou ${data.data.pokemon_name}! 🟣`, 'success');
    BattleState.isMyBattle = false;       } else {
    BattleState.amPlayer1 = false;`${data.data.player_name} capturou ${data.data.pokemon_name}! 🎉`, 'success');
    if (BattleState.autoTurnTimer) {        }
        clearTimeout(BattleState.autoTurnTimer);
        BattleState.autoTurnTimer = null;
    }
    BattleState.battleLog = [];m_full) {
    io! Recebeu R$2!`, 'info');
    // Reset TownState (if it exists)
    if (typeof TownState !== 'undefined') {t(`Você capturou ${data.data.pokemon_name}!`, 'success');
        TownState.playerMoney = 0;
        TownState.ultraBalls = 0;
        TownState.hasMegaStone = false;
        TownState.usedMegaStone = false;ame} tirou ${data.data.dice_roll + 1} - ${data.data.pokemon_name} escapou!`, 'miss');
        TownState.team = [];
        TownState.activeSlot = 0;       // Show toast for the catcher
        TownState.isReady = false;        if (isMyAttempt) {
        TownState.players = [];mon_name} escapou!`, 'warning');
        TownState.selectedPokemonForSell = null;
        TownState.selectedPokemonForMega = null;
    }
     extra delay before state refresh
    // Reset TournamentState (if it exists) && data.data.caught) {
    if (typeof TournamentState !== 'undefined') {imeout(resolve, 2000));
        TournamentState.brackets = [];
        TournamentState.byePlayer = null;
        TournamentState.currentMatch = null;efreshes again
        TournamentState.players = [];false;
        TournamentState.completedMatches = 0;
        TournamentState.totalMatches = 0;pletes
        TournamentState.isParticipant = false;   refreshCatchingState();
        TournamentState.hostPlayerId = null;});
        TournamentState.isTiebreaker = false;
        TournamentState.tiebreakerType = '';ddEventListener('attack', (e) => {
        TournamentState.tiebreakerRound = 1;
    }   const effectText = data.data.type_multiplier > 1 ? ' (Super Efetivo!)' : 
                          (data.data.type_multiplier < 1 ? ' (Pouco Efetivo...)' : '');
    // Hide the floating leave buttonta.data.attacker_name} causou ${data.data.damage} de dano!${effectText}`, 'attack');
    if (DOM.btnLeaveGame) {
        DOM.btnLeaveGame.classList.add('hidden');    if (data.data.defeated) {
    }gLog(`${data.data.target_name} fugiu!`, 'fled');
    
    // Switch to menu screen
    switchScreen('menu');oluiu para ${data.data.evolved.to}! 🌟`, 'evolution');
    
    // Clear any formsngState();
    if (DOM.createPlayerName) DOM.createPlayerName.value = '';});
    if (DOM.joinPlayerName) DOM.joinPlayerName.value = '';
    if (DOM.roomCodeInput) DOM.roomCodeInput.value = '';changed', (e) => {
    hideForm('create');       const data = JSON.parse(e.data);
    hideForm('join');        // Only refresh if we're not in the middle of a catch animation
         if (!GameState.catchAnimationInProgress) {
    showToast('Voltou ao menu', 'info');e();
    console.log('Successfully returned to menu');     }
}

/**
 * API call helper with timeoutGameState.eventSource.addEventListener('pokemon_switched', (e) => {
 */
async function apiCall(endpoint, data = {}, method = 'POST', timeoutMs = 15000) {find(p => p.id == data.data.player_id)?.player_name || 'Um jogador';
    const formData = new FormData();!`, 'info');
    Object.entries(data).forEach(([key, value]) => formData.append(key, value));    refreshCatchingState();
    
    // Create abort controller for timeout
    const controller = new AbortController();vents
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs); (e) => {
    ata);
    try {== 'town') {
        const response = await fetch(endpoint, { handleTownEvent('town_purchase', data.data);
            method,}
            body: method === 'POST' ? formData : undefined,
            credentials: 'include',
            signal: controller.signal_sell', (e) => {
        });
        
        clearTimeout(timeoutId);    handleTownEvent('town_sell', data.data);
        
        // Get response text first for debugging
        const text = await response.text();
        console.log('API Response:', endpoint, text.substring(0, 500));urce.addEventListener('town_ready_toggle', (e) => {
        
        // Try to parse as JSON
        try {   handleTownEvent('town_ready_toggle', data.data);
            return JSON.parse(text);
        } catch (e) {
            console.error('Failed to parse JSON:', text);
            return { success: false, error: 'Server returned invalid response' };se_change', (e) => {
        }
    } catch (error) {andleTownEvent('town_phase_change', data.data);
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            console.error('API Timeout:', endpoint);ameState.eventSource.addEventListener('town_switch_active', (e) => {
            return { success: false, error: 'Request timed out' };       const data = JSON.parse(e.data);
        }        if (GameState.currentScreen === 'town') {
        console.error('API Error:', error);         handleTownEvent('town_switch_active', data.data);
        throw error;
    } });
}

/**ted', (e) => {
 * Create a new room    console.log('SSE battle_started raw:', e.data);
 */JSON.parse(e.data);
async function createRoom() {onsole.log('SSE battle_started parsed:', data);
    const playerName = GameState.account?.nickname || 'Player 1';data.data || data);
    const avatarId = GameState.account?.avatar_id || 1;
    
    setLoading(true);entListener('match_completed', (e) => {
    try {st data = JSON.parse(e.data);
        const result = await apiCall(API.room, {handleTournamentEvent('match_completed', data.data);
            action: 'create',
            player_name: playerName,
            avatar_id: avatarIdurnament_updated', (e) => {
        });
        
        if (result.success) {updated', data.data);
            GameState.roomCode = result.room_code;
            GameState.roomId = result.room_id;
            GameState.playerId = result.player_id;
            GameState.playerNumber = parseInt(result.player_number);entSource.addEventListener('game_finished', (e) => {
            GameState.isHost = result.is_host;
            andleTournamentEvent('game_finished', data.data);
            showToast('Sala criada com sucesso!', 'success');
            enterLobby();
        } else {ameState.eventSource.addEventListener('tiebreaker_tournament', (e) => {
            showToast(result.error || 'Falha ao criar sala', 'error');SON.parse(e.data);
        }       const reason = data.data.reason;
    } catch (error) {        const players = data.data.players || [];
        showToast('Erro de conexão. Tente novamente.', 'error');     const playerNames = players.map(p => p.name).join(', ');
    }
    setLoading(false);     if (reason === 'badges_draw') {
}ESEMPATE! ${playerNames} empataram com 5 insígnias! Eles devem batalhar!`, 'warning');

/**aram com mais insígnias!`, 'warning');
 * Join an existing room
 */    
async function joinRoom() {iebreaker
    const roomCode = DOM.roomCodeInput.value.trim().toUpperCase();
    const playerName = GameState.account?.nickname || 'Player';
    const avatarId = GameState.account?.avatar_id || 1;
    GameState.eventSource.addEventListener('tiebreaker_round', (e) => {
    if (!roomCode || roomCode.length !== 6) {JSON.parse(e.data);
        showToast('Digite um código de sala válido com 6 caracteres', 'warning');howToast(`⚔️ Rodada de Desempate ${data.data.round}! ${data.data.remaining_players} jogadores restantes!`, 'info');
        return;
    }
    
    setLoading(true);
    try {stener('battle_pokemon_selected', (e) => {
        console.log('Joining room:', roomCode, 'as', playerName);(e.data);
        const result = await apiCall(API.room, {dleBattleEvent('pokemon_selected', data.data);
            action: 'join',
            room_code: roomCode,
            player_name: playerName,State.eventSource.addEventListener('battle_started_combat', (e) => {
            avatar_id: avatarIdse(e.data);
        });ata);
        
        console.log('Join result:', result);
        
        if (result.success) {
            GameState.roomCode = result.room_code;leBattleEvent('attack', data.data);
            GameState.roomId = result.room_id;
            GameState.playerId = result.player_id;
            GameState.playerNumber = parseInt(result.player_number);entSource.addEventListener('battle_pokemon_fainted', (e) => {
            GameState.isHost = result.is_host;
            andleBattleEvent('pokemon_fainted', data.data);
            showToast(result.rejoined ? 'Reconectou à sala!' : 'Entrou na sala!', 'success');
            enterLobby();
        } else {, (e) => {
            showToast(result.error || 'Falha ao entrar na sala', 'error');ata = JSON.parse(e.data);
        }'pokemon_sent', data.data);
    } catch (error) {);
        console.error('Join error:', error);   
        showToast('Erro de conexão. Tente novamente.', 'error');    GameState.eventSource.addEventListener('battle_ended', (e) => {
    } finally {     const data = JSON.parse(e.data);
        setLoading(false);('battle_ended', data.data);
    } });
}
addEventListener('reconnect', (e) => {
/**
 * Enter the lobby screen    connectSSE();
 */
function enterLobby() {
    switchScreen('lobby');
    DOM.displayRoomCode.textContent = GameState.roomCode;
    
    if (GameState.isHost) {
        DOM.hostIndicator.classList.remove('hidden');tion disconnectSSE() {
    } else {
        DOM.hostIndicator.classList.add('hidden');tSource.close();
        DOM.btnStartGame.style.display = 'none';    GameState.eventSource = null;
    }
    
    // Start real-time connection (WebSocket with SSE fallback)
    connectRealtime();
     server
    // Start game state watchdog (safety net for missed real-time events)* Falls back to SSE if WebSocket is disabled or fails
    startGameStateWatchdog(); */
    ction connectWebSocket() {
    // Initial room state fetchnabled
    refreshRoomState(); if (!WS_CONFIG.enabled) {
}cket disabled, using SSE fallback');
onnectSSE();
/**
 * Copy room code to clipboard
 */
async function copyRoomCode() {
    try {isconnectWebSocket();
        await navigator.clipboard.writeText(GameState.roomCode);   disconnectSSE();
        showToast('Código copiado!', 'success');    
    } catch (error) { const wsUrl = `${WS_CONFIG.url}/?room_code=${GameState.roomCode}&player_id=${GameState.playerId}`;
        showToast('Falha ao copiar código', 'error');necting to:', wsUrl);
    } 
}
Socket = new WebSocket(wsUrl);
/**
 * Leave the current room
 */ Connected!');
async function leaveRoom() {    GameState.wsReconnectAttempts = 0;
    setLoading(true);
    try {
        await apiCall(API.room, { action: 'leave' });ose = (event) => {
        disconnectRealtime();onnected:', event.code, event.reason);
         null;
        // Reset state
        GameState.roomCode = null;    // Attempt to reconnect if we're still in a room
        GameState.roomId = null;mCode && GameState.wsReconnectAttempts < WS_CONFIG.maxReconnectAttempts) {
        GameState.playerId = null;pts++;
        GameState.isHost = false;le.log(`[WS] Reconnecting in ${WS_CONFIG.reconnectDelay}ms (attempt ${GameState.wsReconnectAttempts})`);
        GameState.players = [];
                       if (GameState.roomCode) {
        switchScreen('menu');  connectWebSocket();
        showToast('Saiu da sala', 'info');                   }
    } catch (error) {                }, WS_CONFIG.reconnectDelay);
        showToast('Erro ao sair da sala', 'error');         } else if (GameState.wsReconnectAttempts >= WS_CONFIG.maxReconnectAttempts) {
    }[WS] Max reconnect attempts reached, falling back to SSE');
    setLoading(false);             connectSSE();
}

/**    
 * Start the game (host only)error) => {
 */
async function startGame() {onclose will be called after this
    if (!GameState.isHost) return;   };
        
    if (GameState.players.length < 2) {Socket.onmessage = (event) => {
        showToast('Precisa de pelo menos 2 jogadores para iniciar', 'warning');   try {
        return;
    }        handleWebSocketMessage(message);
    
    setLoading(true);message:', e);
    try {
        const result = await apiCall(API.room, { action: 'start_game' });
        
        if (result.success) {ch (error) {
            showToast('Jogo iniciando!', 'success');('[WS] Failed to create WebSocket:', error);
            // Screen transition will happen via SSE event);
        } else {   connectSSE();
            showToast(result.error || 'Falha ao iniciar jogo', 'error');
        }
    } catch (error) {
        showToast('Erro de conexão', 'error');
    }
    setLoading(false);
}
ameState.webSocket) {
/**
 * Refresh room state from server
 */
async function refreshRoomState() {
    try {
        console.log('Refreshing room state for:', GameState.roomCode);
        const result = await apiCall(`${API.room}?action=get_room&room_code=${GameState.roomCode}`, {}, 'GET');
        
        console.log('Room state result:', result);me handlers used by SSE
        
        if (result.success) {
            GameState.players = result.players; = message;
            GameState.gameState = result.room.game_state;
            updateLobbyUI();
            
            // Handle game state transitionsetic event data structure matching SSE format
            handleGameStateChange(result.room.game_state);
        } else {   type: eventType,
            console.error('Failed to get room state:', result.error);       data: eventData,
        }        timestamp: timestamp
    } catch (error) { };
        console.error('Failed to refresh room state:', error);
    } // Route to appropriate handler based on event type
}

/**
 * Update lobby UI with current players        break;
 */
function updateLobbyUI() {
    DOM.playersList.innerHTML = '';er_name} entrou!`, 'info');
    DOM.playerCount.textContent = GameState.players.length;
    
    GameState.players.forEach(player => {    
        const card = document.createElement('div');
        card.className = 'player-card';    showToast(`${eventData.player_name} saiu`, 'info');
        if (player.id == GameState.playerId) card.classList.add('is-you');te();
        if (player.is_host) card.classList.add('is-host');
        
        const avatarEmoji = AVATARS[player.avatar_id - 1] || '😎';
        
        card.innerHTML = `hRoomState();
            <div class="player-avatar">${avatarEmoji}</div>  break;
            <div class="player-name">${escapeHtml(player.player_name)}</div>    
            <div class="player-status ${player.is_ready ? 'ready' : ''}">
                ${player.is_host ? '👑 Anfitrião' : (player.is_ready ? '✓ Pronto' : 'Aguardando...')}     if (eventData.first_picker_name) {
            </div>            showToast(`Jogo iniciado! ${eventData.first_picker_name} escolhe primeiro!`, 'success');
        `;
        
        DOM.playersList.appendChild(card);
    });           refreshRoomState();
                break;
    // Update start button state         
    const canStart = GameState.isHost && GameState.players.length >= 2;
    DOM.btnStartGame.disabled = !canStart;         const playerName = GameState.players.find(p => p.id == eventData.player_id)?.player_name || 'Um jogador';
}${playerName} escolheu ${eventData.pokemon_name}!`, 'info');
tScreen === 'initial') {
/**);
 * Connect to Server-Sent Events       }
 */        break;
function connectSSE() {
    if (GameState.eventSource) {
        GameState.eventSource.close();        if (eventData.new_phase === 'catching' && eventData.first_player_name) {
    }de captura! ${eventData.first_player_name} começa!`, 'success');
    
    const url = `${API.sse}?room_code=${GameState.roomCode}`;          const phaseNames = {
    GameState.eventSource = new EventSource(url);                'catching': 'captura',
    
    GameState.eventSource.onopen = () => {,
        console.log('SSE Connected');atalha',
    };hed': 'fim'
    
    GameState.eventSource.onerror = (error) => {me = phaseNames[eventData.new_phase] || eventData.new_phase;
        console.error('SSE Error:', error);   showToast(`Indo para fase de ${phaseName}!`, 'success');
        // Reconnect after delay
        setTimeout(() => {      handleGameStateChange(eventData.new_phase);
            if (GameState.roomCode) {        break;
                connectSSE();
            }
        }, 3000);_state);
    };     break;
            
    // Handle different event types
    GameState.eventSource.addEventListener('connected', (e) => {
        console.log('SSE connection confirmed');gem apareceu!`, 'wild');
    });catchAnimationInProgress) {
             refreshCatchingState();
    GameState.eventSource.addEventListener('player_joined', (e) => {        }
        const data = JSON.parse(e.data);
        showToast(`${data.data.player_name} entrou!`, 'info');
        refreshRoomState();
    });mptEvent(eventData);
         break;
    GameState.eventSource.addEventListener('player_left', (e) => {        
        const data = JSON.parse(e.data);
        showToast(`${data.data.player_name} saiu`, 'info');t = eventData.type_multiplier > 1 ? ' (Super Efetivo!)' : 
        refreshRoomState();                       (eventData.type_multiplier < 1 ? ' (Pouco Efetivo...)' : '');
    });        addCatchingLog(`${eventData.attacker_name} causou ${eventData.damage} de dano!${effectText}`, 'attack');
    
    GameState.eventSource.addEventListener('player_ready', (e) => {Log(`${eventData.target_name} fugiu!`, 'fled');
        refreshRoomState();     }
    });        if (eventData.evolved) {
    ara ${eventData.evolved.to}! 🌟`, 'evolution');
    GameState.eventSource.addEventListener('player_updated', (e) => {
        refreshRoomState();
    });
    
    GameState.eventSource.addEventListener('game_started', (e) => {rn_changed':
        const data = JSON.parse(e.data);) {
        const eventData = data.data || {};       refreshCatchingState();
        if (eventData.first_picker_name) {
            showToast(`Jogo iniciado! ${eventData.first_picker_name} escolhe primeiro!`, 'success');     break;
        } else {        
            showToast('Jogo iniciado!', 'success');
        }eState.players.find(p => p.id == eventData.player_id)?.player_name || 'Um jogador';
        refreshRoomState();
    });
        break;
    GameState.eventSource.addEventListener('starter_selected', (e) => {
        const data = JSON.parse(e.data);
        const playerName = GameState.players.find(p => p.id == data.data.player_id)?.player_name || 'Um jogador';
        showToast(`${playerName} escolheu ${data.data.pokemon_name}!`, 'info'); case 'town_sell':
            case 'town_ready_toggle':
        // Always refresh selection state - handles race conditions where
        // the event arrives before screen transition completes=== 'town') {
        refreshSelectionState(); eventData);
    });    }
    
    GameState.eventSource.addEventListener('phase_changed', (e) => {
        const data = JSON.parse(e.data);
        const eventData = data.data || {};leTownEvent('town_phase_change', eventData);
        
        // Show who goes first in catching phase
        if (eventData.new_phase === 'catching' && eventData.first_player_name) {ts
            showToast(`Indo para fase de captura! ${eventData.first_player_name} começa!`, 'success');
        } else {_started:', eventData);
            const phaseNames = {('battle_started', eventData);
                'catching': 'captura',eak;
                'town': 'cidade',
                'tournament': 'torneio',
                'battle': 'batalha',   handleTournamentEvent('match_completed', eventData);
                'finished': 'fim'
            };     
            const phaseName = phaseNames[eventData.new_phase] || eventData.new_phase;    case 'tournament_updated':
            showToast(`Indo para fase de ${phaseName}!`, 'success');
        }ournament_updated', eventData);
        handleGameStateChange(eventData.new_phase);
    });     break;
            
    GameState.eventSource.addEventListener('state_sync', (e) => {:
        const data = JSON.parse(e.data);
        handleGameStateChange(data.game_state);
    });
    
    // Catching phase events
    GameState.eventSource.addEventListener('wild_pokemon_appeared', (e) => {ta.players || [];
        const data = JSON.parse(e.data);   const tiePlayerNames = players.map(p => p.name).join(', ');
        addCatchingLog(`Um ${data.data.pokemon_name} selvagem apareceu!`, 'wild');     if (reason === 'badges_draw') {
        // Only refresh if we're not in the middle of a catch animation            showToast(`🔥 DESEMPATE! ${tiePlayerNames} empataram com 5 insígnias!`, 'warning');
        if (!GameState.catchAnimationInProgress) {
            refreshCatchingState();FINAL! ${tiePlayerNames} empataram!`, 'warning');
        }
    });    refreshTournamentState();
    
    GameState.eventSource.addEventListener('catch_attempt', async (e) => {
        const data = JSON.parse(e.data);case 'tiebreaker_round':
        const isMyAttempt = data.data.player_id == GameState.playerId;${eventData.round}!`, 'info');
        
        // Block state refreshes during animation
        GameState.catchAnimationInProgress = true;
        
        // Show dice animation for all playersse 'battle_pokemon_selected':
        await showInlineDiceAnimation(    handleBattleEvent('pokemon_selected', eventData);
            data.data.dice_roll,
            data.data.caught,
            data.data.used_ultra_ball
        );
        
        // Log the result
        if (data.data.caught) {_attack':
            if (data.data.team_full) {
                addCatchingLog(`${data.data.player_name} capturou ${data.data.pokemon_name} mas o time está cheio! Recebeu R$2.`, 'success');reak;
            } else if (data.data.used_ultra_ball) {
                addCatchingLog(`${data.data.player_name} usou Ultra Ball e capturou ${data.data.pokemon_name}! 🟣`, 'success');
            } else {'pokemon_fainted', eventData);
                addCatchingLog(`${data.data.player_name} capturou ${data.data.pokemon_name}! 🎉`, 'success');
            }
            emon_sent':
            // Show toast for the catcher
            if (isMyAttempt) {;
                if (data.data.team_full) {
                    showToast(`Time cheio! Recebeu R$2!`, 'info');ttle_ended':
                } else {
                    showToast(`Você capturou ${data.data.pokemon_name}!`, 'success');break;
                }
            }
        } else {
            addCatchingLog(`${data.data.player_name} tirou ${data.data.dice_roll + 1} - ${data.data.pokemon_name} escapou!`, 'miss');reak;
               
            // Show toast for the catcherdefault:
            if (isMyAttempt) {
                showToast(`${data.data.pokemon_name} escapou!`, 'warning');
            }
        }
        
        // If this was the last Pokemon, add extra delay before state refreshocket)
        if (data.data.is_last_pokemon && data.data.caught) {
            await new Promise(resolve => setTimeout(resolve, 2000));nction handleCatchAttemptEvent(eventData) {
        }eState.playerId;
        
        // Animation complete, allow state refreshes againBlock state refreshes during animation
        GameState.catchAnimationInProgress = false;GameState.catchAnimationInProgress = true;
        
        // Refresh state after animation completesrs
        refreshCatchingState();
    });
    
    GameState.eventSource.addEventListener('attack', (e) => {eventData.used_ultra_ball
        const data = JSON.parse(e.data);
        const effectText = data.data.type_multiplier > 1 ? ' (Super Efetivo!)' : 
                          (data.data.type_multiplier < 1 ? ' (Pouco Efetivo...)' : '');g the result
        addCatchingLog(`${data.data.attacker_name} causou ${data.data.damage} de dano!${effectText}`, 'attack');
        
        if (data.data.defeated) {   addCatchingLog(`${eventData.player_name} capturou ${eventData.pokemon_name} mas o time está cheio! Recebeu R$2.`, 'success');
            addCatchingLog(`${data.data.target_name} fugiu!`, 'fled');ed_ultra_ball) {
        }     addCatchingLog(`${eventData.player_name} usou Ultra Ball e capturou ${eventData.pokemon_name}! 🟣`, 'success');
        if (data.data.evolved) {    } else {
            addCatchingLog(`${data.data.evolved.from} evoluiu para ${data.data.evolved.to}! 🌟`, 'evolution');ntData.pokemon_name}! 🎉`, 'success');
        }
        refreshCatchingState();
    });
    ) {
    GameState.eventSource.addEventListener('turn_changed', (e) => {       showToast(`Time cheio! Recebeu R$2!`, 'info');
        const data = JSON.parse(e.data);     } else {
        // Only refresh if we're not in the middle of a catch animation            showToast(`Você capturou ${eventData.pokemon_name}!`, 'success');
        if (!GameState.catchAnimationInProgress) {
            refreshCatchingState();
        }
    });apou!`, 'miss');
    
    // Handle active Pokémon switch - refresh UI for all players
    GameState.eventSource.addEventListener('pokemon_switched', (e) => {     showToast(`${eventData.pokemon_name} escapou!`, 'warning');
        const data = JSON.parse(e.data);    }
        const playerName = GameState.players.find(p => p.id == data.data.player_id)?.player_name || 'Um jogador';
        showToast(`${playerName} trocou para ${data.data.pokemon_name}!`, 'info');
        refreshCatchingState(); extra delay
    });t) {
     await new Promise(resolve => setTimeout(resolve, 2000));
    // Town Phase Events}
    GameState.eventSource.addEventListener('town_purchase', (e) => {
        const data = JSON.parse(e.data);
        handleTownEvent('town_purchase', data.data);
    });reshCatchingState();
    
    GameState.eventSource.addEventListener('town_sell', (e) => {
        const data = JSON.parse(e.data);
        handleTownEvent('town_sell', data.data);back)
    });
    tion connectRealtime() {
    GameState.eventSource.addEventListener('town_ready_toggle', (e) => {
        const data = JSON.parse(e.data);
        handleTownEvent('town_ready_toggle', data.data);
    }); connectSSE();
    }
    GameState.eventSource.addEventListener('town_phase_change', (e) => {
        const data = JSON.parse(e.data);
        handleTownEvent('town_phase_change', data.data);
    });onnect from real-time updates
    
    GameState.eventSource.addEventListener('town_switch_active', (e) => {{
        const data = JSON.parse(e.data);
        handleTownEvent('town_switch_active', data.data);
    });
    
    // Tournament Phase Events
    GameState.eventSource.addEventListener('battle_started', (e) => {le game state changes
        console.log('SSE battle_started raw:', e.data);
        const data = JSON.parse(e.data);
        console.log('SSE battle_started parsed:', data); && GameState.currentScreen !== 'lobby') return;
        handleTournamentEvent('battle_started', data.data || data);
    });eState.gameState = newState;
    
    GameState.eventSource.addEventListener('match_completed', (e) => {
        const data = JSON.parse(e.data);
        handleTournamentEvent('match_completed', data.data);
    });         switchScreen('lobby');
            }
    GameState.eventSource.addEventListener('tournament_updated', (e) => {
        const data = JSON.parse(e.data);
        handleTournamentEvent('tournament_updated', data.data);
    });     loadStarterPokemon();
            break;
    GameState.eventSource.addEventListener('game_finished', (e) => {
        const data = JSON.parse(e.data);
        handleTournamentEvent('game_finished', data.data);
    });
    
    GameState.eventSource.addEventListener('tiebreaker_tournament', (e) => {    switchScreen('town');
        const data = JSON.parse(e.data);
        const reason = data.data.reason;
        const players = data.data.players || [];
        const playerNames = players.map(p => p.name).join(', ');
           initTournamentPhase();
        if (reason === 'badges_draw') {    break;
            showToast(`🔥 DESEMPATE! ${playerNames} empataram com 5 insígnias! Eles devem batalhar!`, 'warning');
        } else if (reason === 'final_draw') {);
            showToast(`🔥 DESEMPATE FINAL! ${playerNames} empataram com mais insígnias!`, 'warning');     initBattlePhase();
        }        break;
        
        // Refresh tournament state to show tiebreaker
        refreshTournamentState();
    });
    
    GameState.eventSource.addEventListener('tiebreaker_round', (e) => {}
        const data = JSON.parse(e.data);
        showToast(`⚔️ Rodada de Desempate ${data.data.round}! ${data.data.remaining_players} jogadores restantes!`, 'info');
        refreshTournamentState();
    });
unction loadStarterPokemon() {
    // Battle Phase EventsDOM.starterGrid.innerHTML = '<p>Carregando iniciais...</p>';
    GameState.eventSource.addEventListener('battle_pokemon_selected', (e) => {
        const data = JSON.parse(e.data);
        handleBattleEvent('pokemon_selected', data.data);
    }); // Load available starters (pass room_code for dynamic starter count)
        const startersResult = await apiCall(`${API.pokemon}?action=get_starters&room_code=${GameState.roomCode}`, {}, 'GET');
    GameState.eventSource.addEventListener('battle_started_combat', (e) => {
        const data = JSON.parse(e.data);
        handleBattleEvent('combat_started', data.data);is', 'error');
    });     return;
        }
    GameState.eventSource.addEventListener('battle_attack', (e) => {
        const data = JSON.parse(e.data);sult.starters.length} starters for ${startersResult.player_count} players`);
        handleBattleEvent('attack', data.data);
    }); // Load current selection state
        const stateResult = await apiCall(`${API.pokemon}?action=get_selection_state&room_code=${GameState.roomCode}`, {}, 'GET');
    GameState.eventSource.addEventListener('battle_pokemon_fainted', (e) => {
        const data = JSON.parse(e.data);
        handleBattleEvent('pokemon_fainted', data.data);leção', 'error');
    });     return;
        }
    GameState.eventSource.addEventListener('battle_pokemon_sent', (e) => {
        const data = JSON.parse(e.data);
        handleBattleEvent('pokemon_sent', data.data);
    }); GameState.selectionState = stateResult;
        
    GameState.eventSource.addEventListener('battle_ended', (e) => {
        const data = JSON.parse(e.data);
        handleBattleEvent('battle_ended', data.data);
    });atch (error) {
           console.error('Error loading starters:', error);
    GameState.eventSource.addEventListener('reconnect', (e) => {        showToast('Erro ao carregar Pokémon iniciais', 'error');
        console.log('SSE reconnect requested'); }
        connectSSE();
    });
}

/**
 * Disconnect SSE
 */onst starters = GameState.starters || [];
function disconnectSSE() {   const state = GameState.selectionState || {};
    if (GameState.eventSource) {    const players = state.players || [];
        GameState.eventSource.close(); const currentTurn = state.current_turn ?? 0;
        GameState.eventSource = null;.playerNumber === currentTurn;
    }
} // Find which Pokemon have been selected
= players
/**
 * Connect to WebSocket serverpokemon_id));
 * Falls back to SSE if WebSocket is disabled or fails
 */dicator
function connectWebSocket() {ntPlayer = players.find(p => p.player_number === currentTurn);
    // Check if WebSocket is enabledf (isMyTurn) {
    if (!WS_CONFIG.enabled) {    DOM.initialTurnIndicator.textContent = '🎯 Sua vez! Escolha seu Pokémon inicial!';
        console.log('[WS] WebSocket disabled, using SSE fallback');style.color = '#4ade80';
        connectSSE();er) {
        return;urnIndicator.textContent = `Aguardando ${currentPlayer.player_name} escolher...`;
    }    DOM.initialTurnIndicator.style.color = '#fbbf24';
    
    // Close existing connections
    disconnectWebSocket();// Render starter grid
    disconnectSSE();tarterGrid.innerHTML = '';
    
    const wsUrl = `${WS_CONFIG.url}/?room_code=${GameState.roomCode}&player_id=${GameState.playerId}`;const isSelected = selectedPokemonIds.includes(pokemon.id);
    console.log('[WS] Connecting to:', wsUrl);on, isSelected, isMyTurn && !isSelected);
    
    try {
        GameState.webSocket = new WebSocket(wsUrl);  card.addEventListener('click', () => selectStarter(pokemon.id));
        }
        GameState.webSocket.onopen = () => {
            console.log('[WS] Connected!');
            GameState.wsReconnectAttempts = 0;
        };
        
        GameState.webSocket.onclose = (event) => {
            console.log('[WS] Disconnected:', event.code, event.reason);
            GameState.webSocket = null;
            
            // Attempt to reconnect if we're still in a room
            if (GameState.roomCode && GameState.wsReconnectAttempts < WS_CONFIG.maxReconnectAttempts) {
                GameState.wsReconnectAttempts++;nCard(pokemon, isSelected = false, isClickable = false) {
                console.log(`[WS] Reconnecting in ${WS_CONFIG.reconnectDelay}ms (attempt ${GameState.wsReconnectAttempts})`););
                setTimeout(() => {
                    if (GameState.roomCode) {
                        connectWebSocket();ssList.add('clickable');
                    }
                }, WS_CONFIG.reconnectDelay);nnerHTML = `
            } else if (GameState.wsReconnectAttempts >= WS_CONFIG.maxReconnectAttempts) {<div class="pokemon-sprite">
                console.log('[WS] Max reconnect attempts reached, falling back to SSE');${pokemon.name}" 
                connectSSE();githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/0.png'">
            }
        };iv class="pokemon-name">${pokemon.name}</div>
        <div class="pokemon-types">
        GameState.webSocket.onerror = (error) => {efense}">${pokemon.type_defense}</span>
            console.error('[WS] Error:', error);emon.type_attack !== pokemon.type_defense ? 
            // onclose will be called after this_attack}">${pokemon.type_attack}</span>` : ''}
        };
        on-stats">
        GameState.webSocket.onmessage = (event) => {
            try {   <span class="stat-label">HP</span>
                const message = JSON.parse(event.data);      <span class="stat-value">${pokemon.base_hp}</span>
                handleWebSocketMessage(message);    </div>
            } catch (e) {s="stat">
                console.error('[WS] Failed to parse message:', e);
            }on.base_attack}</span>
        };
               <div class="stat">
    } catch (error) {               <span class="stat-label">SPD</span>
        console.error('[WS] Failed to create WebSocket:', error);                <span class="stat-value">${pokemon.base_speed}</span>
        console.log('[WS] Falling back to SSE');         </div>
        connectSSE();
    }     ${isSelected ? '<div class="selected-overlay">ESCOLHIDO</div>' : ''}
}

/**
 * Disconnect WebSocket
 */
function disconnectWebSocket() {
    if (GameState.webSocket) {* Render the list of players and their selections
        GameState.webSocket.close(); */
        GameState.webSocket = null;ction renderSelectedList(players) {
    }
    GameState.wsReconnectAttempts = 0;
} players.forEach(player => {
t('div');
/**
 * Handle incoming WebSocket messages    
 * Routes messages to the same handlers used by SSE] || '😎';
 */    const isMe = player.id == GameState.playerId;
function handleWebSocketMessage(message) {
    const { event: eventType, data: eventData, timestamp } = message;name) {
    ML = `
    console.log('[WS] Received:', eventType, eventData);ss="mini-avatar">${avatarEmoji}</div>
    "${isMe ? 'is-you' : ''}">${escapeHtml(player.player_name)}</span>
    // Create a synthetic event data structure matching SSE format          <span>→</span>
    const syntheticData = {            <img src="${player.sprite_url}" alt="${player.pokemon_name}" 
        type: eventType,
        data: eventData,rror="this.style.display='none'">
        timestamp: timestamplayer.pokemon_name}</span>
    };
    
    // Route to appropriate handler based on event typeitem.innerHTML = `
    switch (eventType) {ini-avatar">${avatarEmoji}</div>
        case 'connected':(player.player_name)}</span>
            console.log('[WS] Connection confirmed');iting">Aguardando...</span>
            break;
            
        case 'player_joined':
            showToast(`${eventData.player_name} entrou!`, 'info');
            refreshRoomState();
            break;
            
        case 'player_left':
            showToast(`${eventData.player_name} saiu`, 'info');
            refreshRoomState();
            break;ectStarter(pokemonId) {
            ng(true);
        case 'player_ready':
        case 'player_updated':
            refreshRoomState();
            break;'select_starter',
            
        case 'game_started':
            if (eventData.first_picker_name) {
                showToast(`Jogo iniciado! ${eventData.first_picker_name} escolhe primeiro!`, 'success');.success) {
            } else {showToast(`Você escolheu ${result.pokemon.name}!`, 'success');
                showToast('Jogo iniciado!', 'success');
            }
            refreshRoomState();...', 'info');
            break;
            
        case 'starter_selected': Refresh selection state
            const playerName = GameState.players.find(p => p.id == eventData.player_id)?.player_name || 'Um jogador';    await refreshSelectionState();
            showToast(`${playerName} escolheu ${eventData.pokemon_name}!`, 'info');
            // Always refresh - handles race conditions where event arrives before screen transition
            refreshSelectionState();
            break;
            
        case 'phase_changed':rter:', error);
            if (eventData.new_phase === 'catching' && eventData.first_player_name) { inicial', 'error');
                showToast(`Indo para fase de captura! ${eventData.first_player_name} começa!`, 'success');
            } else {
                const phaseNames = {
                    'catching': 'captura',
                    'town': 'cidade',
                    'tournament': 'torneio',
                    'battle': 'batalha',lection state
                    'finished': 'fim'
                };reshSelectionState() {
                const phaseName = phaseNames[eventData.new_phase] || eventData.new_phase;
                showToast(`Indo para fase de ${phaseName}!`, 'success');it apiCall(`${API.pokemon}?action=get_selection_state&room_code=${GameState.roomCode}`, {}, 'GET');
            }
            handleGameStateChange(eventData.new_phase);.success) {
            break;GameState.selectionState = result;
            on();
        case 'state_sync':
            handleGameStateChange(eventData.game_state);
            break;e:', error);
            
        // Catching phase events
        case 'wild_pokemon_appeared':
            addCatchingLog(`Um ${eventData.pokemon_name} selvagem apareceu!`, 'wild');===================================
            if (!GameState.catchAnimationInProgress) {
                refreshCatchingState();
            }
            break;
            hing phase
        case 'catch_attempt':
            handleCatchAttemptEvent(eventData);
            break;
            
        case 'attack':
            const effectText = eventData.type_multiplier > 1 ? ' (Super Efetivo!)' : atchingLogMessages) {
                              (eventData.type_multiplier < 1 ? ' (Pouco Efetivo...)' : '');rHTML = '';
            addCatchingLog(`${eventData.attacker_name} causou ${eventData.damage} de dano!${effectText}`, 'attack');
            if (eventData.defeated) {
                addCatchingLog(`${eventData.target_name} fugiu!`, 'fled');e de Captura!', 'system');
            }
            if (eventData.evolved) {initial state
                addCatchingLog(`${eventData.evolved.from} evoluiu para ${eventData.evolved.to}! 🌟`, 'evolution');te();
            }
            refreshCatchingState();
            break;
            g phase state from server
        case 'turn_changed':
            if (!GameState.catchAnimationInProgress) {ate() {
                refreshCatchingState();
            }.roomCode}`, {}, 'GET');
            break;
            .success) {
        case 'pokemon_switched':GameState.catchingState = result;
            const switchPlayerName = GameState.players.find(p => p.id == eventData.player_id)?.player_name || 'Um jogador';kemon = result.wild_pokemon;
            showToast(`${switchPlayerName} trocou para ${eventData.pokemon_name}!`, 'info');Route = result.room.current_route || 1;
            refreshCatchingState();ountersRemaining = result.room.encounters_remaining || 0;
            break;
            rn
        // Town Phase Eventse.playerId);
        case 'town_purchase':er == result.room.current_player_turn;
        case 'town_sell':
        case 'town_ready_toggle':ate all UI elements
        case 'town_switch_active':renderCatchingUI(result);
            // Always handle town events - don't gate on currentScreen
            // because the screen might not have transitioned yet and I'm first
            handleTownEvent(eventType, eventData);esult.wild_pokemon && GameState.isMyTurn && GameState.isHost) {
            break;    await spawnWildPokemon();
            
        case 'town_phase_change':
            handleTownEvent('town_phase_change', eventData);result.error);
            break;
            ) {
        // Tournament/Battle Eventsole.error('Error refreshing catching state:', error);
        case 'battle_started':
            console.log('[WS] battle_started:', eventData);
            handleTournamentEvent('battle_started', eventData);
            break;
            ements
        case 'match_completed':
            handleTournamentEvent('match_completed', eventData);
            break;ata.room;
            ayers = data.players;
        case 'tournament_updated':wild_pokemon;
            // Always handle tournament updates regardless of current screen
            handleTournamentEvent('tournament_updated', eventData);e info
            break;routeName) {
            oom.route_name || `Rota ${room.current_route}`;
        case 'game_finished':
            handleTournamentEvent('game_finished', eventData);
            break;ters_remaining}`;
            
        case 'tiebreaker_tournament':
            const reason = eventData.reason;oom.current_route}/8`;
            const players = eventData.players || [];
            const tiePlayerNames = players.map(p => p.name).join(', ');
            if (reason === 'badges_draw') {
                showToast(`🔥 DESEMPATE! ${tiePlayerNames} empataram com 5 insígnias!`, 'warning');mon(wildPokemon);
            } else if (reason === 'final_draw') {
                showToast(`🔥 DESEMPATE FINAL! ${tiePlayerNames} empataram!`, 'warning');
            }
            refreshTournamentState();
            break;on buttons
            tionButtons(wildPokemon);
        case 'tiebreaker_round':
            showToast(`⚔️ Rodada de Desempate ${eventData.round}!`, 'info');
            refreshTournamentState();
            break;
            
        // Battle Phase Events
        case 'battle_pokemon_selected':
            handleBattleEvent('pokemon_selected', eventData);
            break;derWildPokemon(pokemon) {
            ay) return;
        case 'battle_started_combat':
            handleBattleEvent('combat_started', eventData);
            break;wildPokemonDisplay.classList.remove('hidden');
            assList.add('hidden');
        case 'battle_attack':
            handleBattleEvent('attack', eventData);ldPokemonImg) {
            break;DOM.wildPokemonImg.src = pokemon.sprite_url || 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/0.png';
            = pokemon.name;
        case 'battle_pokemon_fainted':
            handleBattleEvent('pokemon_fainted', eventData);ldPokemonName) {
            break;DOM.wildPokemonName.textContent = pokemon.name;
            
        case 'battle_pokemon_sent':
            handleBattleEvent('pokemon_sent', eventData); type (always shown)
            break;DOM.wildPokemonTypeDef) {
            PokemonTypeDef.textContent = pokemon.type_defense;
        case 'battle_ended':ame = `type-badge ${pokemon.type_defense}`;
            handleBattleEvent('battle_ended', eventData);
            break;
            k type (only shown if different from defense)
        case 'pong':
            // Heartbeat response, ignore       if (pokemon.type_attack && pokemon.type_attack !== pokemon.type_defense) {
            break;               DOM.wildPokemonTypeAtk.textContent = pokemon.type_attack;
                            DOM.wildPokemonTypeAtk.className = `type-badge ${pokemon.type_attack}`;
        default:             DOM.wildPokemonTypeAtk.classList.remove('hidden');
            console.log('[WS] Unhandled event type:', eventType);
    }             DOM.wildPokemonTypeAtk.classList.add('hidden');
}

/**    
 * Handle catch attempt event (shared between SSE and WebSocket)
 */
async function handleCatchAttemptEvent(eventData) {        DOM.wildPokemonAtk.textContent = pokemon.base_attack || '?';
    const isMyAttempt = eventData.player_id == GameState.playerId;
    
    // Block state refreshes during animationpd.textContent = pokemon.base_speed || '?';
    GameState.catchAnimationInProgress = true;
    
    // Show dice animation for all players  // Update HP bar
    await showInlineDiceAnimation(    const hpPercent = Math.max(0, (pokemon.current_hp / pokemon.max_hp) * 100);
        eventData.dice_roll,pBar) {
        eventData.caught,tyle.width = `${hpPercent}%`;
        eventData.used_ultra_balle = 'hp-bar';
    );
    -low');
    // Log the result
    if (eventData.caught) {DOM.wildHpBar.classList.add('hp-medium');
        if (eventData.team_full) {
            addCatchingLog(`${eventData.player_name} capturou ${eventData.pokemon_name} mas o time está cheio! Recebeu R$2.`, 'success');
        } else if (eventData.used_ultra_ball) {if (DOM.wildHpText) {
            addCatchingLog(`${eventData.player_name} usou Ultra Ball e capturou ${eventData.pokemon_name}! 🟣`, 'success');.textContent = `${pokemon.current_hp}/${pokemon.max_hp}`;
        } else {
            addCatchingLog(`${eventData.player_name} capturou ${eventData.pokemon_name}! 🎉`, 'success');
        }monDisplay.classList.add('hidden');
        
        if (isMyAttempt) {
            if (eventData.team_full) {
                showToast(`Time cheio! Recebeu R$2!`, 'info');
            } else {
                showToast(`Você capturou ${eventData.pokemon_name}!`, 'success');r turn indicator
            }
        }
    } else { currentPlayer = players.find(p => p.player_number == currentTurn);
        addCatchingLog(`${eventData.player_name} tirou ${eventData.dice_roll + 1} - ${eventData.pokemon_name} escapou!`, 'miss');
        if (DOM.currentTurnName && currentPlayer) {
        if (isMyAttempt) {yer.id == GameState.playerId 
            showToast(`${eventData.pokemon_name} escapou!`, 'warning');
        }
    }
    
    // If this was the last Pokemon, add extra delayndicator) {
    if (eventData.is_last_pokemon && eventData.caught) {
        await new Promise(resolve => setTimeout(resolve, 2000));nIndicator.classList.add('your-turn');
    }       } else {
                DOM.catchingTurnIndicator.classList.remove('your-turn');
    // Animation complete     }
    GameState.catchAnimationInProgress = false;
    refreshCatchingState();
}

/**ate
 * Connect to real-time updates (WebSocket with SSE fallback)
 */Buttons(wildPokemon) {
function connectRealtime() {onst canAct = GameState.isMyTurn && wildPokemon;
    if (WS_CONFIG.enabled) {   const actionButtonsContainer = document.getElementById('player-action-buttons');
        connectWebSocket();    
    } else { // Show/hide action buttons based on turn
        connectSSE();
    }     if (GameState.isMyTurn) {
}ner.classList.remove('hidden');

/**ttonsContainer.classList.add('hidden');
 * Disconnect from real-time updates       }
 */    }
function disconnectRealtime() { 
    disconnectWebSocket();
    disconnectSSE();     DOM.btnCatch.disabled = !canAct;
}

/**has ultra balls
 * Handle game state changesGameState.catchingState?.players?.find(p => p.id == GameState.playerId);
 */Player?.ultra_balls || 0;
function handleGameStateChange(newState) {led = !canAct || ultraBalls <= 0;
    // Map game states to expected screensllCount) {
    const stateToScreen = {Content = `${ultraBalls}`;
        'lobby': 'lobby',
        'initial': 'initial',
        'catching': 'catching', (DOM.btnAttack) {
        'town': 'town',    // Check if player has an active Pokemon
        'tournament': 'tournament',layers?.find(p => p.id == GameState.playerId);
        'battle': 'battle',
        'finished': 'victory'    DOM.btnAttack.disabled = !canAct || !hasActivePokemon;
    };
    
    const expectedScreen = stateToScreen[newState];
    const alreadyOnCorrectScreen = expectedScreen && GameState.currentScreen === expectedScreen;
    
    // Skip if we're already in this state AND on the correct screen
    // (unless we're in lobby, where we always re-process to handle game_started), currentTurn) {
    if (newState === GameState.gameState && alreadyOnCorrectScreen && newState !== 'lobby') return;if (!DOM.catchingPlayersPanel) return;
    
    console.log(`[StateChange] ${GameState.gameState} → ${newState} (screen: ${GameState.currentScreen} → ${expectedScreen})`);rsPanel.innerHTML = '';
    
    GameState.gameState = newState;
     card = document.createElement('div');
    switch (newState) {Name = 'catching-player-card';
        case 'lobby':er_number == currentTurn) card.classList.add('active-turn');
            if (GameState.currentScreen !== 'lobby') {er.id == GameState.playerId;
                switchScreen('lobby');.classList.add('is-you');
            }
            break;arEmoji = AVATARS[player.avatar_id - 1] || '😎';
        case 'initial':yer.team || [];
            switchScreen('initial');
            loadStarterPokemon();all Pokemon sprites with EXP (only if they can evolve)
            startSelectionPolling();
            break;ength > 0) {
        case 'catching': = '<div class="player-team-grid">';
            stopSelectionPolling();=> {
            switchScreen('catching');ve = pokemon.is_active;
            initCatchingPhase();nst expDisplay = pokemon.current_exp || 0;
            break;lick = isCurrentPlayer;
        case 'town':on.evolution_id != null;
            switchScreen('town');nEvolve ? ` | EXP: ${expDisplay}/5` : '';
            initTownPhase();nst statsTitle = `${pokemon.name}${isActive ? ' (Ativo)' : ''}\nHP: ${pokemon.base_hp} | ATQ: ${pokemon.base_attack} | VEL: ${pokemon.base_speed}${expInfo}`;
            break;ml += `
        case 'tournament':m-pokemon-slot ${isActive ? 'active' : ''} ${canClick ? 'clickable' : ''}" 
            switchScreen('tournament');="${statsTitle}"
            initTournamentPhase();       ${canClick ? `data-pokemon-id="${pokemon.id}"` : ''}>
            break;<img src="${pokemon.sprite_url || ''}" alt="${pokemon.name}" class="team-pokemon-sprite" onerror="this.src='https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/0.png'">
        case 'battle': ? `<span class="pokemon-exp-badge">${expDisplay}</span>` : ''}
            switchScreen('battle');
            initBattlePhase();
            break;
        case 'finished': empty slots
            stopSelectionPolling();       for (let i = team.length; i < 6; i++) {
            stopGameStateWatchdog();               teamHtml += '<div class="team-pokemon-slot empty"></div>';
            switchScreen('victory');            }
            loadVictoryScreen();         teamHtml += '</div>';
            break;
    }         teamHtml = '<div class="no-pokemon">Nenhum Pokémon ainda</div>';
}

/**
 * Load starter Pokemon options        <div class="catching-player-header">
 */       <span class="player-avatar-mini">${avatarEmoji}</span>
async function loadStarterPokemon() {span>
    DOM.starterGrid.innerHTML = '<p>Carregando iniciais...</p>';
    DOM.initialTurnIndicator.textContent = 'Carregando...';    </div>
    
    try {
        // Load available starters (pass room_code for dynamic starter count)an class="stat-item" title="Insígnias">🎖️ ${player.badges || 0}</span>
        const startersResult = await apiCall(`${API.pokemon}?action=get_starters&room_code=${GameState.roomCode}`, {}, 'GET');       <span class="stat-item" title="Dinheiro">💰 R$${player.money || 0}</span>
                <span class="stat-item" title="Ultra Balls">◓ ${player.ultra_balls || 0}</span>
        if (!startersResult.success) {
            showToast('Falha ao carregar iniciais', 'error');`;
            return;
        }
        if (isCurrentPlayer) {
        console.log(`Loaded ${startersResult.starters.length} starters for ${startersResult.player_count} players`);.team-pokemon-slot.clickable:not(.active)').forEach(slot => {
        
        // Load current selection state const pokemonId = slot.dataset.pokemonId;
        const stateResult = await apiCall(`${API.pokemon}?action=get_selection_state&room_code=${GameState.roomCode}`, {}, 'GET');           if (pokemonId) {
                        setActivePokemon(pokemonId);
        if (!stateResult.success) {
            showToast('Falha ao carregar estado de seleção', 'error');
            return;
        }}
        
        // Store starters in game stateappendChild(card);
        GameState.starters = startersResult.starters;
        GameState.selectionState = stateResult;
        
        // Render the UI
        renderStarterSelection();t a Pokemon as active
        */
    } catch (error) {async function setActivePokemon(pokemonId) {
        console.error('Error loading starters:', error); try {
        showToast('Erro ao carregar Pokémon iniciais', 'error');piCall(API.catching, { 
    }         action: 'set_active',
}

/**
 * Render starter selection UI
 */
function renderStarterSelection() {
    const starters = GameState.starters || [];        await refreshCatchingState();
    const state = GameState.selectionState || {};
    const players = state.players || [];'Falha ao trocar Pokémon', 'error');
    const currentTurn = parseInt(state.current_turn ?? 0);
    const isMyTurn = GameState.playerNumber == currentTurn;
        console.error('Error setting active Pokemon:', error);
    // Find which Pokemon have been selectedtrocar Pokémon', 'error');
    const selectedPokemonIds = players
        .filter(p => p.pokemon_id)
        .map(p => parseInt(p.pokemon_id));
    
    // Update turn indicator by first player/host when needed)
    const currentPlayer = players.find(p => p.player_number === currentTurn);
    if (isMyTurn) {
        DOM.initialTurnIndicator.textContent = '🎯 Sua vez! Escolha seu Pokémon inicial!';ry {
        DOM.initialTurnIndicator.style.color = '#4ade80';    const result = await apiCall(API.catching, { action: 'spawn_wild' });
    } else if (currentPlayer) {
        DOM.initialTurnIndicator.textContent = `Aguardando ${currentPlayer.player_name} escolher...`;
        DOM.initialTurnIndicator.style.color = '#fbbf24'; = result.pokemon;
    }
    
    // Render starter grid    console.error('Failed to spawn wild Pokemon:', result.error);
    DOM.starterGrid.innerHTML = '';
    starters.forEach(pokemon => {
        const isSelected = selectedPokemonIds.includes(pokemon.id);onsole.error('Error spawning wild Pokemon:', error);
        const card = createPokemonCard(pokemon, isSelected, isMyTurn && !isSelected);
        
        if (isMyTurn && !isSelected) {
            card.addEventListener('click', () => selectStarter(pokemon.id));
        }d Pokemon
        
        DOM.starterGrid.appendChild(card);sync function attemptCatch(useUltraBall = false) {
    });    if (!GameState.isMyTurn || !GameState.wildPokemon) {
         showToast("Não é sua vez!", 'warning');
    // Render selected list
    renderSelectedList(players); }
}

/**
 * Create a Pokemon card element
 */
function createPokemonCard(pokemon, isSelected = false, isClickable = false) {        action: 'catch',
    const card = document.createElement('div');ball: useUltraBall ? 'true' : 'false'
    card.className = 'pokemon-card';
    if (isSelected) card.classList.add('disabled');
    if (isClickable) card.classList.add('clickable');
     Animation and state update handled via SSE for all players
    card.innerHTML = `-pokemon delay handling
        <div class="pokemon-sprite">lt = result.result;
            <img src="${pokemon.sprite_url}" alt="${pokemon.name}" 
                 onerror="this.src='https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/0.png'">ror');
        </div>
        <div class="pokemon-name">${pokemon.name}</div>rror) {
        <div class="pokemon-types">ting catch:', error);
            <span class="type-badge ${pokemon.type_defense}">${pokemon.type_defense}</span>tar capturar', 'error');
            ${pokemon.type_attack !== pokemon.type_defense ? 
                `<span class="type-badge ${pokemon.type_attack}">${pokemon.type_attack}</span>` : ''}}
        </div>se);
        <div class="pokemon-stats">
            <div class="stat">
                <span class="stat-label">HP</span>
                <span class="stat-value">${pokemon.base_hp}</span>e animation next to wild Pokemon (triggered via SSE for all players)
            </div>- The final dice value (0-5)
            <div class="stat">successful
                <span class="stat-label">ATK</span>
                <span class="stat-value">${pokemon.base_attack}</span>
            </div> showInlineDiceAnimation(finalValue, caught, usedUltraBall) {
            <div class="stat">
                <span class="stat-label">SPD</span> (usedUltraBall) {
                <span class="stat-value">${pokemon.base_speed}</span>    await showUltraBallAnimation();
            </div>
        </div>   }
        ${isSelected ? '<div class="selected-overlay">ESCOLHIDO</div>' : ''}    
    `; const diceContainer = document.getElementById('catch-dice-animation');
    '.dice-face');
    return card; 
}eturn;

/**// Reset state
 * Render the list of players and their selectionscatch-dice';
 */
function renderSelectedList(players) {
    DOM.selectedList.innerHTML = '';Container.classList.remove('hidden');
    
    players.forEach(player => {
        const item = document.createElement('div');t diceFaces = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
        item.className = 'selected-item';
        g for 500ms (faster)
        const avatarEmoji = AVATARS[player.avatar_id - 1] || '😎';
        const isMe = player.id == GameState.playerId;
        
        if (player.pokemon_name) {
            item.innerHTML = `
                <div class="mini-avatar">${avatarEmoji}</div>
                <span class="${isMe ? 'is-you' : ''}">${escapeHtml(player.player_name)}</span>
                <span>→</span>
                <img src="${player.sprite_url}" alt="${player.pokemon_name}" how random dice face
                     style="width: 32px; height: 32px;" diceFaces[Math.floor(Math.random() * 6)];
                     onerror="this.style.display='none'">
                <span>${player.pokemon_name}</span>
            `;
        } else {  clearInterval(rollTimer);
            item.innerHTML = `       resolve();
                <div class="mini-avatar">${avatarEmoji}</div>    }
                <span class="${isMe ? 'is-you' : ''}">${escapeHtml(player.player_name)}</span>
                <span class="waiting">Aguardando...</span>
            `;   
        }    // Show final result
         diceFace.textContent = diceFaces[finalValue];
        DOM.selectedList.appendChild(item);.add('stopped');
    }); 
}

/**    diceContainer.classList.add('success');
 * Select a starter Pokemone {
 */
async function selectStarter(pokemonId) {
    setLoading(true);
     showing result for a moment
    try {t new Promise(resolve => setTimeout(resolve, 600));
        const result = await apiCall(API.pokemon, {
            action: 'select_starter',
            pokemon_id: pokemonIdainer.classList.add('hidden');
        });
        
        if (result.success) {
            showToast(`Você escolheu ${result.pokemon.name}!`, 'success');
            
            if (result.phase_complete) {ion() {
                showToast('Todos os jogadores escolheram! Iniciando fase de captura...', 'info');all-animation');
                // Transition directly — don't rely solely on WS/SSE event
                // The WS/SSE event may also arrive, but handleGameStateChangereturn;
                // will ignore it if we're already on the catching screen
                setTimeout(() => {
                    handleGameStateChange('catching');.classList.remove('active');
                }, 1500);assList.remove('hidden');
            } else {
                // Refresh selection stateigger animation
                await refreshSelectionState(); ensure CSS reset takes effect
            };
        } else {
            showToast(result.error || 'Falha ao selecionar inicial', 'error');
        }// Wait for animation to complete (1 second)
    } catch (error) {resolve => setTimeout(resolve, 1000));
        console.error('Error selecting starter:', error);   
        showToast('Erro ao selecionar inicial', 'error');    // Hide after animation
    } ultraBall.classList.add('hidden');
    move('active');
    setLoading(false);
}

/**
 * Refresh selection state
 */mon() {
async function refreshSelectionState() {
    try {
        const result = await apiCall(`${API.pokemon}?action=get_selection_state&room_code=${GameState.roomCode}`, {}, 'GET');
        
        if (result.success) {
            // Check if game state has changed (e.g., initial → catching)
            // This handles the case where a WS/SSE phase_changed event was missed
            if (result.game_state && result.game_state !== 'initial') {
                console.log(`Selection polling detected phase change to: ${result.game_state}`);ing, { action: 'attack' });
                handleGameStateChange(result.game_state);
                return;
            }age} damage!`;
            f (result.type_multiplier > 1) {
            GameState.selectionState = result;       msg += ' Super effective!';
            // Only render if starters have been loaded (result.type_multiplier < 1) {
            if (GameState.starters) {
                renderStarterSelection();       }
            }           
        }            if (result.defeated) {
    } catch (error) {             msg += ` The wild Pokémon fled!`;
        console.error('Error refreshing selection state:', error);
    }         
}
Seu Pokémon evoluiu para ${result.evolved.to}!`, 'success');
/**
 * Start polling for selection state updates (fallback for missed WS events)
 */
function startSelectionPolling() {
    stopSelectionPolling();d via SSE
    GameState.selectionPollInterval = setInterval(() => { else {
        if (GameState.currentScreen === 'initial') {howToast(result.error || 'Ataque falhou', 'error');
            refreshSelectionState();       }
        } else {    } catch (error) {
            stopSelectionPolling();     console.error('Error attacking:', error);
        }ar', 'error');
    }, 3000); }
}

/**
 * Stop selection phase polling
 */
function stopSelectionPolling() {* Add a message to the catching log
    if (GameState.selectionPollInterval) { */
        clearInterval(GameState.selectionPollInterval);ction addCatchingLog(message, type = 'info') {
        GameState.selectionPollInterval = null;
    }
}

/** entry.innerHTML = `<span class="log-time">${new Date().toLocaleTimeString()}</span> ${message}`;
 * Start a general-purpose game state watchdog.
 * Periodically checks the server's current game_state and triggersappendChild(entry);
 * phase transitions if a WS/SSE event was missed.ollHeight;
 * This is a safety net — real-time events should handle most transitions.
 */
function startGameStateWatchdog() {hildren.length > 50) {
    stopGameStateWatchdog();gLogMessages.removeChild(DOM.catchingLogMessages.firstChild);
    GameState.gameStateWatchdogInterval = setInterval(async () => {
        // Only run if we're in an active game
        if (!GameState.roomCode) {
            stopGameStateWatchdog();
            return;
        }
        
        try {turn;
            const result = await apiCall(`${API.room}?action=get_room&room_code=${GameState.roomCode}`, {}, 'GET');
            if (result.success && result.room) {
                const serverState = result.room.game_state;
                // If the server's game state differs from ours, transitionDOM.btnCatch?.disabled) attemptCatch(false);
                if (serverState && serverState !== GameState.gameState) {reak;
                    console.log(`[Watchdog] Detected state mismatch: local=${GameState.gameState}, server=${serverState}. Transitioning...`);
                    GameState.players = result.players || GameState.players;
                    handleGameStateChange(serverState);
                }ase 'a':
            }ed) attackWildPokemon();
        } catch (error) {           break;
            // Silently ignore — this is a background safety check    }
            console.debug('[Watchdog] Poll error:', error);
        }
    }, 5000); // Check every 5 seconds============================================
}
=
/**
 * Stop the game state watchdog
 */WN PHASE FUNCTIONS
function stopGameStateWatchdog() {/ ============================================
    if (GameState.gameStateWatchdogInterval) {
        clearInterval(GameState.gameStateWatchdogInterval);
        GameState.gameStateWatchdogInterval = null;
    }
}const TownState = {
 playerMoney: 0,
// ============================================
// CATCHING PHASE FUNCTIONS hasMegaStone: false,
// ============================================

/**activeSlot: 0,
 * Initialize the catching phasese,
 */
async function initCatchingPhase() {
    console.log('Initializing catching phase...');electedPokemonForMega: null,
    shopPrices: {
    // Clear log
    if (DOM.catchingLogMessages) {    evo_soda: 1,
        DOM.catchingLogMessages.innerHTML = '';
    }
    ;
    addCatchingLog('Bem-vindo à Fase de Captura!', 'system');
    
    // Load initial state
    await refreshCatchingState();
}
le.log('Initializing Town Phase...');
/**
 * Refresh catching phase state from serverhow leave game button
 */st.remove('hidden');
async function refreshCatchingState() {
    try {
        const result = await apiCall(`${API.catching}?action=get_state&room_code=${GameState.roomCode}`, {}, 'GET');
        
        if (result.success) {
            // Check if game state has changed (e.g., catching → town));
            // This handles the case where a WS/SSE phase_changed event was missed
            if (result.room.game_state && result.room.game_state !== 'catching') {
                console.log(`Catching state polling detected phase change to: ${result.room.game_state}`);
                handleGameStateChange(result.room.game_state);
                return;
            }
            buttons
            GameState.catchingState = result;tElementById('btn-buy-ultra');
            GameState.wildPokemon = result.wild_pokemon;
            GameState.currentRoute = result.room.current_route || 1;a-stone');
            GameState.turnsPerPlayer = result.room.turns_per_player || 8;nTownReady = document.getElementById('btn-town-ready');
            
            // Track my turns taken
            const myPlayer = result.players.find(p => p.id == GameState.playerId);oSoda?.addEventListener('click', buyEvoSoda);
            GameState.myTurnsTaken = myPlayer?.turns_taken || 0;('click', buyMegaStone);
            lick', toggleTownReady);
            // Check if it's my turn
            GameState.isMyTurn = myPlayer && myPlayer.player_number == result.room.current_player_turn;
            
            // Update all UI elements
            renderCatchingUI(result);
            efreshTownState() {
            // Spawn wild Pokemon if needed and it's my turn and I'm first
            if (!result.wild_pokemon && GameState.isMyTurn && GameState.isHost) {onst result = await apiCall(
                await spawnWildPokemon();.php?action=get_state&room_code=${GameState.roomCode}&player_id=${GameState.playerId}`,
            }
        } else {       'GET'
            console.error('Failed to get catching state:', result.error);       );
        }        
    } catch (error) {     if (!result.success) {
        console.error('Error refreshing catching state:', error); estado da cidade', 'error');
    }         return;
}

/**
 * Render all catching phase UI elementsyer.money;
 */    TownState.ultraBalls = result.player.ultra_balls;
function renderCatchingUI(data) {aStone = result.player.has_mega_stone || false;
    const room = data.room;gaStone = result.player.used_mega_stone || false;
    const players = data.players;
    const wildPokemon = data.wild_pokemon;   TownState.activeSlot = result.player.active_pokemon_slot;
    .player.is_ready;
    // Update route info
    if (DOM.routeName) {TownState.shopPrices;
        DOM.routeName.textContent = room.route_name || `Rota ${room.current_route}`;;
    }
    if (DOM.encountersRemaining) {   // Render UI
        // Show current cycle / total turns per player
        const currentCycle = room.current_cycle || 1;
        const turnsPerPlayer = room.turns_per_player || 8; catch (error) {
        DOM.encountersRemaining.textContent = `Ciclo: ${currentCycle}/${turnsPerPlayer}`;    console.error('Error loading town state:', error);
    }r dados da cidade', 'error');
    if (DOM.routeProgress) {
        DOM.routeProgress.textContent = `Rota ${room.current_route}/5`;
    }
    
    // Update wild Pokemon displayender Town UI
    renderWildPokemon(wildPokemon);
    
    // Update turn indicator// Update header info
    renderTurnIndicator(players, room.current_player_turn);cument.getElementById('town-player-money');
    oute-indicator');
    // Update action buttons   const ultraCount = document.getElementById('town-ultra-count');
    updateActionButtons(wildPokemon);    
     if (moneyDisplay) moneyDisplay.textContent = `R$ ${TownState.playerMoney}`;
    // Update players panelndicator.textContent = `Rota ${GameState.currentRoute}/8`;
    renderPlayersPanel(players, room.current_player_turn); if (ultraCount) ultraCount.textContent = TownState.ultraBalls;
}

/**const btnBuyUltra = document.getElementById('btn-buy-ultra');
 * Render wild Pokemon displayoSoda = document.getElementById('btn-buy-evo-soda');
 */uy-mega-stone');
function renderWildPokemon(pokemon) {
    if (!DOM.wildPokemonDisplay) return;btnBuyUltra) {
    wnState.playerMoney < TownState.shopPrices.ultra_ball;
    if (pokemon) {
        DOM.wildPokemonDisplay.classList.remove('hidden');
        DOM.wildPokemonPlaceholder?.classList.add('hidden');/ Check if active Pokemon can gain EXP
        State.team.find(p => p.slot === TownState.activeSlot);
        if (DOM.wildPokemonImg) {an_evolve;
            DOM.wildPokemonImg.src = pokemon.sprite_url || 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/0.png';tnBuyEvoSoda.disabled = TownState.playerMoney < TownState.shopPrices.evo_soda || !canGainExp;
            DOM.wildPokemonImg.alt = pokemon.name;
        }
        if (DOM.wildPokemonName) {n Mega Evolve
            DOM.wildPokemonName.textContent = pokemon.name;State.activeSlot);
        }
                                    activePokemon.has_mega && 
        // Defense type (always shown)                             activePokemon.mega_evolution_id && 
        if (DOM.wildPokemonTypeDef) {
            DOM.wildPokemonTypeDef.textContent = pokemon.type_defense;
            DOM.wildPokemonTypeDef.className = `type-badge ${pokemon.type_defense}`;Pokemon can mega evolve
        }mega_stone && 
        
        // Attack type (only shown if different from defense)
        if (DOM.wildPokemonTypeAtk) {      canActiveMegaEvolve;
            if (pokemon.type_attack && pokemon.type_attack !== pokemon.type_defense) {
                DOM.wildPokemonTypeAtk.textContent = pokemon.type_attack;
                DOM.wildPokemonTypeAtk.className = `type-badge ${pokemon.type_attack}`;/ Update button text based on state
                DOM.wildPokemonTypeAtk.classList.remove('hidden');if (TownState.usedMegaStone) {
            } else {uyMegaStone.innerHTML = '<span class="shop-item-icon">💎</span><span class="shop-item-name">Mega Stone</span><span class="shop-item-price">USADO</span>';
                DOM.wildPokemonTypeAtk.classList.add('hidden'); = 'Você já usou sua Mega Stone nesta partida';
            }
        }   btnBuyMegaStone.innerHTML = `<span class="shop-item-icon">💎</span><span class="shop-item-name">Mega Evoluir ${activePokemon.name}</span><span class="shop-item-price">R$ ${TownState.shopPrices.mega_stone}</span>`;
         = `Mega Evoluir ${activePokemon.name} → ${activePokemon.mega_name}`;
        // Stats
        if (DOM.wildPokemonAtk) {   btnBuyMegaStone.innerHTML = `<span class="shop-item-icon">💎</span><span class="shop-item-name">Mega Stone</span><span class="shop-item-price">R$ ${TownState.shopPrices.mega_stone}</span>`;
            DOM.wildPokemonAtk.textContent = pokemon.base_attack || '?';    btnBuyMegaStone.title = 'Selecione um Pokémon com Mega Evolução como ativo';
        }
        if (DOM.wildPokemonSpd) {
            DOM.wildPokemonSpd.textContent = pokemon.base_speed || '?';
        }
        
        // Update HP bar
        const hpPercent = Math.max(0, (pokemon.current_hp / pokemon.max_hp) * 100);
        if (DOM.wildHpBar) {
            DOM.wildHpBar.style.width = `${hpPercent}%`;
            DOM.wildHpBar.className = 'hp-bar'; ready button
            if (hpPercent <= 25) {eReadyButton();
                DOM.wildHpBar.classList.add('hp-low');
            } else if (hpPercent <= 50) {
                DOM.wildHpBar.classList.add('hp-medium');
            }r Town Team Grid
        }
        if (DOM.wildHpText) {
            DOM.wildHpText.textContent = `${pokemon.current_hp}/${pokemon.max_hp}`;d');
        }name');
        
        // Display catch rate
        if (DOM.wildCatchRate) {
            const catchRate = pokemon.catch_rate || 30;
            DOM.wildCatchRate.textContent = `${catchRate}%`;
            // Color-code: green if high, yellow if medium, red if low
            DOM.wildCatchRate.className = 'catch-rate-value';n Team Data:', TownState.team);
            if (catchRate >= 60) {
                DOM.wildCatchRate.classList.add('catch-rate-high'); 6 slots (max team size)
            } else if (catchRate >= 35) {let i = 0; i < 6; i++) {
                DOM.wildCatchRate.classList.add('catch-rate-medium');find(p => p.slot === i);
            } else {
                DOM.wildCatchRate.classList.add('catch-rate-low');lot.className = 'town-pokemon-slot';
            }
        }
        if (DOM.wildCatchRateDisplay) {
            DOM.wildCatchRateDisplay.classList.remove('hidden');on.evolution_stage;
        }
    } else {   const expDisplay = pokemon.exp || 0;
        DOM.wildPokemonDisplay.classList.add('hidden');       const canMegaEvolve = pokemon.has_mega && pokemon.mega_evolution_id && !pokemon.is_mega;
        DOM.wildPokemonPlaceholder?.classList.remove('hidden');           const isMega = pokemon.is_mega;
        if (DOM.wildCatchRateDisplay) {            
            DOM.wildCatchRateDisplay.classList.add('hidden');         // Ensure we have a valid sprite URL
        }Url = pokemon.sprite_url || `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${pokemon.pokemon_id}.png`;
    }         console.log(`Pokemon ${pokemon.name} (ID: ${pokemon.pokemon_id}): sprite_url = ${spriteUrl}`);
}

/**        if (isMega) slot.classList.add('mega-evolved');
 * Render turn indicatoregaStone) slot.classList.add('can-mega-evolve');
 */
function renderTurnIndicator(players, currentTurn) {e image element separately to add load/error handlers
    const currentPlayer = players.find(p => p.player_number == currentTurn););
           img.src = spriteUrl;
    if (DOM.currentTurnName && currentPlayer) {        img.alt = pokemon.name;
        DOM.currentTurnName.textContent = currentPlayer.id == GameState.playerId kemon-sprite';
            ? 'Sua' nsole.log(`✓ Image loaded: ${pokemon.name}`);
            : `Vez de ${currentPlayer.player_name}`;
    }console.error(`✗ Image FAILED: ${pokemon.name} - ${spriteUrl}`);
    /sprites/master/sprites/pokemon/0.png';
    if (DOM.catchingTurnIndicator) {   };
        if (GameState.isMyTurn) {       
            DOM.catchingTurnIndicator.classList.add('your-turn');           slot.appendChild(img);
        } else {            
            DOM.catchingTurnIndicator.classList.remove('your-turn');         // Add Mega badge if this Pokemon is mega evolved
        }
    }             const megaBadge = document.createElement('span');
}mon-mega-badge';

/**
 * Update action buttons state        }
 */
function updateActionButtons(wildPokemon) { indicator if player has mega stone and Pokemon can mega evolve
    const canAct = GameState.isMyTurn && wildPokemon;TownState.hasMegaStone) {
    const actionButtonsContainer = document.getElementById('player-action-buttons');span');
    megaIndicator.className = 'pokemon-mega-indicator';
    // Show/hide action buttons based on turn
    if (actionButtonsContainer) {       megaIndicator.title = `Mega Evolução disponível → ${pokemon.mega_name}`;
        if (GameState.isMyTurn) {           slot.appendChild(megaIndicator);
            actionButtonsContainer.classList.remove('hidden');        }
        } else {
            actionButtonsContainer.classList.add('hidden');
        });
    }
    = expDisplay;
    if (DOM.btnCatch) {
        DOM.btnCatch.disabled = !canAct;
        // Update catch button text to show current catch rate
        const btnText = DOM.btnCatch.querySelector('.btn-text');Element('span');
        if (btnText && wildPokemon) {   sellBadge.className = 'pokemon-sell-badge';
            const catchRate = wildPokemon.catch_rate || 30;       sellBadge.textContent = `$${sellPrice}`;
            btnText.textContent = `Capturar (${catchRate}%)`;(sellBadge);
        } else if (btnText) {
            btnText.textContent = 'Capturar'; ''}\nHP: ${pokemon.hp} | ATQ: ${pokemon.attack} | VEL: ${pokemon.speed}`;
        }pDisplay}/5`;
    }oluir → ${pokemon.mega_name}`;
    if (DOM.btnUltraCatch) {der por R$${sellPrice}`;
        // Check if player has ultra balls
        const myPlayer = GameState.catchingState?.players?.find(p => p.id == GameState.playerId);   
        const ultraBalls = myPlayer?.ultra_balls || 0;       slot.addEventListener('click', () => handleTownPokemonClick(pokemon, i));
        DOM.btnUltraCatch.disabled = !canAct || ultraBalls <= 0;
        if (DOM.ultraBallCount) {
            DOM.ultraBallCount.textContent = `${ultraBalls}`;
        }
    }
    if (DOM.btnAttack) {   grid.appendChild(slot);
        // Check if player has an active Pokemon   }
        const myPlayer = GameState.catchingState?.players?.find(p => p.id == GameState.playerId);    
        const hasActivePokemon = myPlayer?.active_pokemon; // Update active Pokemon name
        DOM.btnAttack.disabled = !canAct || !hasActivePokemon;slot === TownState.activeSlot);
    } if (activeInfo) {
}tivePokemon.name : '---';

/**
 * Render players panel with their Pokemon and status
 */
function renderPlayersPanel(players, currentTurn) { in the town team grid
    if (!DOM.catchingPlayersPanel) return;
    
    DOM.catchingPlayersPanel.innerHTML = '';
    
    players.forEach(player => {kemon
        const card = document.createElement('div');if (TownState.team.length > 1) {
        card.className = 'catching-player-card';
        if (player.player_number == currentTurn) card.classList.add('active-turn');
        const isCurrentPlayer = player.id == GameState.playerId;    showToast('Não pode vender seu último Pokémon!', 'warning');
        if (isCurrentPlayer) card.classList.add('is-you');
        
        const avatarEmoji = AVATARS[player.avatar_id - 1] || '😎';on
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
                         title="${statsTitle}".success) {
                         ${canClick ? `data-pokemon-id="${pokemon.id}"` : ''}>nState.activeSlot = slot;
                        <img src="${pokemon.sprite_url || ''}" alt="${pokemon.name}" class="team-pokemon-sprite" onerror="this.src='https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/0.png'">essage, 'success');
                        ${canEvolve ? `<span class="pokemon-exp-badge">${expDisplay}</span>` : ''}
                    </div>
                `;howToast(result.error || 'Falha ao trocar Pokémon', 'error');
            });
            // Add empty slotsor) {
            for (let i = team.length; i < 6; i++) {
                teamHtml += '<div class="team-pokemon-slot empty"></div>';howToast('Erro ao trocar Pokémon', 'error');
            }
            teamHtml += '</div>';
        } else {
            teamHtml = '<div class="no-pokemon">Nenhum Pokémon ainda</div>';
        }sell confirmation modal
        
        const turnsTaken = player.turns_taken || 0;
        const turnsPerPlayer = GameState.turnsPerPlayer || 8;
        const turnsRemaining = Math.max(0, turnsPerPlayer - turnsTaken);
        
        card.innerHTML = `
            <div class="catching-player-header">l
                <span class="player-avatar-mini">${avatarEmoji}</span>ument.createElement('div');
                <span class="player-name">${escapeHtml(player.player_name)}</span>
                ${player.player_number == currentTurn ? '<span class="turn-badge">🎯</span>' : ''}
                <span class="turns-badge" title="Turnos restantes">🔄 ${turnsRemaining}</span>
            </div>
            ${teamHtml}nder Pokémon?</h3>
            <div class="catching-player-stats">  <div class="sell-modal-pokemon">
                <span class="stat-item" title="Insígnias">🎖️ ${player.badges || 0}</span>        <img src="${pokemon.sprite_url}" alt="${pokemon.name}">
                <span class="stat-item" title="Dinheiro">💰 R$${player.money || 0}</span>
                <span class="stat-item" title="Ultra Balls">◓ ${player.ultra_balls || 0}</span>ell-modal-price">R$ ${sellPrice}</span>
            </div>
        `;
        m-sell">Vender</button>
        // Add click handlers for the current player's Pokemon (except the active one)tn-secondary" id="btn-cancel-sell">Cancelar</button>
        if (isCurrentPlayer) {
            card.querySelectorAll('.team-pokemon-slot.clickable:not(.active)').forEach(slot => {
                slot.addEventListener('click', () => {
                    const pokemonId = slot.dataset.pokemonId;
                    if (pokemonId) {ent.body.appendChild(overlay);
                        setActivePokemon(pokemonId);
                    }
                });ument.getElementById('btn-confirm-sell').addEventListener('click', confirmSellPokemon);
            });   document.getElementById('btn-cancel-sell').addEventListener('click', closeSellModal);
        }    overlay.addEventListener('click', (e) => {
             if (e.target === overlay) closeSellModal();
        DOM.catchingPlayersPanel.appendChild(card);
    });
}

/**
 * Set a Pokemon as active
 */
async function setActivePokemon(pokemonId) {verlay = document.getElementById('sell-modal-overlay');
    try {overlay) overlay.remove();
        const result = await apiCall(API.catching, { ForSell = null;
            action: 'set_active',
            pokemon_id: pokemonId
        });
        xecute Pokemon sale
        if (result.success) {
            showToast(result.message, 'success');ction confirmSellPokemon() {
            // Refresh the catching state to update the UIownState.selectedPokemonForSell;
            await refreshCatchingState();
        } else {
            showToast(result.error || 'Falha ao trocar Pokémon', 'error');loseSellModal();
        }   
    } catch (error) {    try {
        console.error('Error setting active Pokemon:', error);     const result = await apiCall('api/town.php?action=sell_pokemon', {
        showToast('Falha ao trocar Pokémon', 'error');
    }         player_id: GameState.playerId,
}d
);
/**
 * Spawn a wild Pokemon (called by first player/host when needed)if (result.success) {
 */message, 'success');
async function spawnWildPokemon() {y;
    try {n.name} por R$${result.sell_price}`, 'sell');
        const result = await apiCall(API.catching, { action: 'spawn_wild' });
        
        if (result.success) {   showToast(result.error || 'Falha ao vender Pokémon', 'error');
            GameState.wildPokemon = result.pokemon;
            renderWildPokemon(result.pokemon);
        } else if (result.error !== 'Wild Pokemon already active') {   console.error('Error selling Pokemon:', error);
            console.error('Failed to spawn wild Pokemon:', result.error);       showToast('Erro ao vender Pokémon', 'error');
        }    }
    } catch (error) {
        console.error('Error spawning wild Pokemon:', error);
    }
}

/**
 * Attempt to catch the wild Pokemonte.playerMoney < 3) {
 */   showToast('Dinheiro insuficiente!', 'warning');
async function attemptCatch(useUltraBall = false) {    return;
    if (!GameState.isMyTurn || !GameState.wildPokemon) {
        showToast("Não é sua vez!", 'warning');
        return;
    }ction=buy_ultra_ball', {
    tate.roomCode,
    setLoading(true);
    
    try {
        const result = await apiCall(API.catching, {
            action: 'catch',
            use_ultra_ball: useUltraBall ? 'true' : 'false'
        });
        ownLogMessage('Comprou Ultra Ball!', 'purchase');
        if (result.success) {
            // Animation and state update handled via SSE for all players else {
            // Just store the result for potential last-pokemon delay handling(result.error || 'Falha na compra', 'error');
            GameState.lastCatchResult = result.result;
        } else {
            showToast(result.error || 'Falha na captura', 'error');   console.error('Error buying ultra ball:', error);
        }    showToast('Erro ao comprar Ultra Ball', 'error');
    } catch (error) {
        console.error('Error attempting catch:', error);
        showToast('Erro ao tentar capturar', 'error');
    }
    
    setLoading(false);
}

/**     showToast('Dinheiro insuficiente!', 'warning');
 * Show inline dice animation next to wild Pokemon (triggered via SSE for all players)
 * @param {number} finalValue - The final dice value (0-5)
 * @param {boolean} caught - Whether the catch was successful
 * @param {boolean} usedUltraBall - Whether an Ultra Ball was used
 */esult = await apiCall('api/town.php?action=buy_evo_soda', {
async function showInlineDiceAnimation(finalValue, caught, usedUltraBall) {       room_code: GameState.roomCode,
    // If Ultra Ball was used, show special animation instead of dice        player_id: GameState.playerId
    if (usedUltraBall) {
        await showUltraBallAnimation();
        return;    if (result.success) {
    }ew_money;
            showToast(result.message, 'success');
    const diceContainer = document.getElementById('catch-dice-animation');
    const diceFace = diceContainer?.querySelector('.dice-face');
                addTownLogMessage(`🎉 ${result.evolved_to} evoluiu!`, 'evolution');
    if (!diceContainer || !diceFace) return;se {
    oda - +1 EXP!', 'purchase');
    // Reset state        }
    diceContainer.className = 'catch-dice';
    
    // Show dice    } else {
    diceContainer.classList.remove('hidden');mpra', 'error');
    
    // Dice face emojis for d6 (0-5 maps to ⚀-⚅)
    const diceFaces = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];r('Error buying evo soda:', error);
        showToast('Erro ao comprar Evo Soda', 'error');
    // Animate the dice rolling for 500ms (faster)
    const rollDuration = 500;
    const rollInterval = 50; // Change face every 50ms
    let elapsed = 0;
    
    await new Promise(resolve => {
        const rollTimer = setInterval(() => {
            elapsed += rollInterval;State.playerMoney < TownState.shopPrices.mega_stone) {
            , 'warning');
            // Show random dice face
            const randomFace = diceFaces[Math.floor(Math.random() * 6)];
            diceFace.textContent = randomFace;
            Stone || TownState.usedMegaStone) {
            if (elapsed >= rollDuration) { showToast('Você só pode usar uma Mega Stone por partida!', 'warning');
                clearInterval(rollTimer);    return;
                resolve();
            }
        }, rollInterval);lve
    });const activePokemon = TownState.team.find(p => p.slot === TownState.activeSlot);
    n.has_mega || !activePokemon.mega_evolution_id || activePokemon.is_mega) {
    // Show final result('Selecione um Pokémon com Mega Evolução como ativo!', 'warning');
    diceFace.textContent = diceFaces[finalValue];
    diceContainer.classList.add('stopped');
    
    // Add success/fail animation classry {
    if (caught) {    // Buy Mega Stone and Mega Evolve in one action
        diceContainer.classList.add('success');pi/town.php?action=buy_and_mega_evolve', {
    } else {
        diceContainer.classList.add('fail');        player_id: GameState.playerId
    }
    
    // Keep showing result for a moment       if (result.success) {
    await new Promise(resolve => setTimeout(resolve, 600));            TownState.playerMoney = result.new_money;
             TownState.hasMegaStone = false;
    // Hide dice after animation
    diceContainer.classList.add('hidden');         showToast(`💎 ${activePokemon.name} Mega Evoluiu para ${result.mega_name}!`, 'success');
}ePokemon.name} Mega Evoluiu para ${result.mega_name}!`, 'mega-evolution');

/**    } else {
 * Show Ultra Ball throw animation (guaranteed catch)t.error || 'Falha na Mega Evolução', 'error');
 */    }
async function showUltraBallAnimation() {) {
    const ultraBall = document.getElementById('ultra-ball-animation');stone:', error);
    tone', 'error');
    if (!ultraBall) return;}
    
    // Reset state
    ultraBall.classList.remove('active');
    ultraBall.classList.remove('hidden');dal
    
    // Trigger animation{
    // Small delay to ensure CSS reset takes effect
    await new Promise(resolve => setTimeout(resolve, 10));
    ultraBall.classList.add('active');
    ment('div');
    // Wait for animation to complete (1 second)ay mega-evolution-modal';
    await new Promise(resolve => setTimeout(resolve, 1000));   overlay.id = 'mega-evolution-modal-overlay';
        overlay.innerHTML = `
    // Hide after animation     <div class="sell-modal mega-modal">
    ultraBall.classList.add('hidden');olução</h3>
    ultraBall.classList.remove('active');         <div class="mega-evolution-preview">
}emon-before">
="${pokemon.name}">
/**>
 * Attack the wild Pokemon </div>
 */           <div class="mega-arrow">→</div>
async function attackWildPokemon() {            <div class="mega-pokemon-after">
    if (!GameState.isMyTurn || !GameState.wildPokemon) {img src="${pokemon.mega_sprite_url}" alt="${pokemon.mega_name}">
        showToast("Não é sua vez!", 'warning');                <span>${pokemon.mega_name}</span>
        return;       </div>
    }
        <p class="mega-warning">⚠️ Você só pode usar UMA Mega Evolução por partida!</p>
    setLoading(true);fo">A Mega Evolução é permanente durante o jogo.</p>
    
    try {click="closeMegaEvolutionModal()">Cancelar</button>
        const result = await apiCall(API.catching, { action: 'attack' });firm" onclick="confirmMegaEvolution()">💎 Mega Evoluir!</button>
        
        if (result.success) {
            let msg = `Dealt ${result.damage} damage!`;
            if (result.type_multiplier > 1) {
                msg += ' Super effective!';lay);
            } else if (result.type_multiplier < 1) {
                msg += ' Not very effective...';
            }
            
            if (result.defeated) {
                msg += ` The wild Pokémon fled!`;eMegaEvolutionModal() {
            }erlay = document.getElementById('mega-evolution-modal-overlay');
            
            if (result.evolved) {lay.remove();
                showToast(`Seu Pokémon evoluiu para ${result.evolved.to}!`, 'success');
            }lectedPokemonForMega = null;
            
            showToast(msg, 'info');
            
            // State will be updated via SSE
        } else {
            showToast(result.error || 'Ataque falhou', 'error'); function confirmMegaEvolution() {
        }const pokemon = TownState.selectedPokemonForMega;
    } catch (error) {rn;
        console.error('Error attacking:', error);   
        showToast('Erro ao atacar', 'error');    closeMegaEvolutionModal();
    } 
    
    setLoading(false);     const result = await apiCall('api/town.php?action=mega_evolve', {
}
,
/**        team_id: pokemon.team_id
 * Add a message to the catching log
 */
function addCatchingLog(message, type = 'info') {
    if (!DOM.catchingLogMessages) return;        TownState.hasMegaStone = false;
    
    const entry = document.createElement('div');
    entry.className = `log-entry log-${type}`;        addTownLogMessage(`💎 ${pokemon.name} Mega Evoluiu para ${result.mega_name}!`, 'mega-evolution');
    entry.innerHTML = `<span class="log-time">${new Date().toLocaleTimeString()}</span> ${message}`;e();
    
    DOM.catchingLogMessages.appendChild(entry);
    DOM.catchingLogMessages.scrollTop = DOM.catchingLogMessages.scrollHeight;   }
       } catch (error) {
    // Keep only last 50 messages        console.error('Error mega evolving:', error);
    while (DOM.catchingLogMessages.children.length > 50) {     showToast('Erro ao Mega Evoluir', 'error');
        DOM.catchingLogMessages.removeChild(DOM.catchingLogMessages.firstChild);
    }
}

/**oggle ready status
 * Handle keyboard shortcuts for catching phase
 */ggleTownReady() {
function handleCatchingKeyboard(e) {
    if (GameState.currentScreen !== 'catching' || !GameState.isMyTurn) return;lt = await apiCall('api/town.php?action=toggle_ready', {
    code: GameState.roomCode,
    switch (e.key.toLowerCase()) {
        case 'c':
            if (!DOM.btnCatch?.disabled) attemptCatch(false);
            break;
        case 'u':ate.isReady = result.is_ready;
            if (!DOM.btnUltraCatch?.disabled) attemptCatch(true);       updateReadyButton();
            break;           
        case 'a':            // Update ready status display
            if (!DOM.btnAttack?.disabled) attackWildPokemon();mentById('town-ready-status');
            break;
    }sult.ready_count}/${result.total_players} jogadores prontos`;
}            }

// ============================================all_ready) {
// END CATCHING PHASE FUNCTIONSrontos! Iniciando Torneio...', 'success');
// ============================================                // Game state change will be handled by SSE
         } else {
// ============================================wToast(result.is_ready ? 'Você está pronto!' : 'Pronto cancelado', 'info');
// TOWN PHASE FUNCTIONS         }
// ============================================
st(result.error || 'Falha ao atualizar status de pronto', 'error');
/**
 * Town Phase State
 */ror toggling ready:', error);
const TownState = {oast('Erro ao atualizar status de pronto', 'error');
    playerMoney: 0,
    ultraBalls: 0,
    hasMegaStone: false,
    usedMegaStone: false,
    team: [],
    activeSlot: 0,
    isReady: false,tton() {
    players: [],ment.getElementById('btn-town-ready');
    selectedPokemonForSell: null,
    selectedPokemonForMega: null,
    shopPrices: {y) {
        ultra_ball: 3,t = 'Cancelar Pronto';
        evo_soda: 1,   btn.classList.add('is-ready');
        mega_stone: 5,  } else {
        hp_boost: 2,        btn.textContent = 'Pronto para Torneio';
        attack_boost: 2,     btn.classList.remove('is-ready');
        speed_boost: 2
    } 
};
r(p => p.is_ready).length;
/**const readyStatus = document.getElementById('town-ready-status');
 * Initialize Town Phase
 */${TownState.players.length} jogadores prontos`;
async function initTownPhase() {}
    console.log('Initializing Town Phase...');
    
    // Show leave game button
    DOM.btnLeaveGame?.classList.remove('hidden');
    
    // Load town state from serverunction renderTownPlayersList() {
    await refreshTownState();    const list = document.getElementById('town-players-list');
     if (!list) return;
    // Setup town event listeners
    setupTownListeners(); list.innerHTML = '';
}
rs.forEach(player => {
/**
 * Setup Town Phase event listeners
 */
function setupTownListeners() {
    // Shop buttons
    const btnBuyUltra = document.getElementById('btn-buy-ultra');
    const btnBuyEvoSoda = document.getElementById('btn-buy-evo-soda');
    const btnBuyMegaStone = document.getElementById('btn-buy-mega-stone');    const avatar = AVATARS[avatarIndex] || '😎';
    const btnBuyHpBoost = document.getElementById('btn-buy-hp-boost');
    const btnBuyAttackBoost = document.getElementById('btn-buy-attack-boost');
    const btnBuySpeedBoost = document.getElementById('btn-buy-speed-boost');
    const btnTownReady = document.getElementById('btn-town-ready');
    }</span>
    btnBuyUltra?.addEventListener('click', buyUltraBall);' : 'Shopping...'}</span>
    btnBuyEvoSoda?.addEventListener('click', buyEvoSoda);
    btnBuyMegaStone?.addEventListener('click', buyMegaStone);       `;
    btnBuyHpBoost?.addEventListener('click', () => buyStatBoost('hp'));        
    btnBuyAttackBoost?.addEventListener('click', () => buyStatBoost('attack'));     list.appendChild(card);
    btnBuySpeedBoost?.addEventListener('click', () => buyStatBoost('speed'));
    btnTownReady?.addEventListener('click', toggleTownReady);
}

/**
 * Refresh Town State from server
 */nLogMessage(message, type = 'info') {
async function refreshTownState() {ages = document.getElementById('town-log-messages');
    try {ogMessages) return;
        const result = await apiCall(
            `api/town.php?action=get_state&room_code=${GameState.roomCode}&player_id=${GameState.playerId}`,ateElement('div');
            {},
            'GET' = `<span class="log-time">${new Date().toLocaleTimeString()}</span> ${message}`;
        );
        essages.appendChild(entry);
        if (!result.success) {
            showToast('Falha ao carregar estado da cidade', 'error');
            return;
        }
        .removeChild(logMessages.firstChild);
        // Check if game state has changed (e.g., town → tournament)
        // This handles the case where a WS/SSE phase_changed event was missed
        if (result.room.game_state && result.room.game_state !== 'town') {
            console.log(`Town state polling detected phase change to: ${result.room.game_state}`);
            handleGameStateChange(result.room.game_state);
            return;
        }
        
        // Update local state
        TownState.playerMoney = result.player.money;d) {
        TownState.ultraBalls = result.player.ultra_balls;=== 'ultra_ball' ? 'Ultra Ball' : 'Evo Soda';
        TownState.hasMegaStone = result.player.has_mega_stone || false;`, 'info');
        TownState.usedMegaStone = result.player.used_mega_stone || false;
        TownState.team = result.team;            addTownLogMessage(`${data.pokemon_name} de ${data.player_name} evoluiu para ${data.evolved_to}!`, 'evolution');
        TownState.activeSlot = result.player.active_pokemon_slot;
        TownState.isReady = result.player.is_ready;
        TownState.players = result.players;    break;
        TownState.shopPrices = result.shop_prices || TownState.shopPrices;
        GameState.currentRoute = result.room.current_route;
        
        // Render UI           addTownLogMessage(`${data.player_name} vendeu ${data.pokemon_name}`, 'info');
        renderTownUI();           }
                    break;
    } catch (error) {         
        console.error('Error loading town state:', error);n_ready_toggle':
        showToast('Erro ao carregar dados da cidade', 'error');         // Refresh players list to update ready status
    }ate();
}

/**
 * Render Town UI
 */            showToast('Todos os jogadores prontos! Iniciando Torneio...', 'success');
function renderTownUI() {
    // Update header info
    const moneyDisplay = document.getElementById('town-player-money');
    const routeIndicator = document.getElementById('town-route-indicator');        
    const ultraCount = document.getElementById('town-ultra-count');':
    
    if (moneyDisplay) moneyDisplay.textContent = `R$ ${TownState.playerMoney}`;ata.pokemon_name}`, 'info');
    if (routeIndicator) routeIndicator.textContent = `Rota ${GameState.currentRoute}/5`;
    if (ultraCount) ultraCount.textContent = TownState.ultraBalls;        break;
    
    // Update shop button states
    const btnBuyUltra = document.getElementById('btn-buy-ultra');
    const btnBuyEvoSoda = document.getElementById('btn-buy-evo-soda');=======================
    const btnBuyMegaStone = document.getElementById('btn-buy-mega-stone');
    
    if (btnBuyUltra) {
        btnBuyUltra.disabled = TownState.playerMoney < TownState.shopPrices.ultra_ball;
    }URNAMENT PHASE FUNCTIONS
    if (btnBuyEvoSoda) {=====================
        // Check if active Pokemon can gain EXP
        const activePokemon = TownState.team.find(p => p.slot === TownState.activeSlot);
        const canGainExp = activePokemon && activePokemon.can_evolve;
        btnBuyEvoSoda.disabled = TownState.playerMoney < TownState.shopPrices.evo_soda || !canGainExp;
    }
    if (btnBuyMegaStone) {
        // Check if active Pokemon can Mega Evolvelayer: null,
        const activePokemon = TownState.team.find(p => p.slot === TownState.activeSlot);
        const canActiveMegaEvolve = activePokemon && 
                                     activePokemon.has_mega && 
                                     activePokemon.mega_evolution_id && 
                                     !activePokemon.is_mega;
        
        // Can buy mega stone if: has enough money AND hasn't used one yet AND active Pokemon can mega evolveebreaker: false,
        const canBuyMega = TownState.playerMoney >= TownState.shopPrices.mega_stone && 
                          !TownState.hasMegaStone && 
                          !TownState.usedMegaStone &&
                          canActiveMegaEvolve;
        btnBuyMegaStone.disabled = !canBuyMega;
        
        // Update button text based on state
        if (TownState.usedMegaStone) {nitTournamentPhase() {
            btnBuyMegaStone.innerHTML = '<span class="shop-item-icon">💎</span><span class="shop-item-name">Mega Stone</span><span class="shop-item-price">USADO</span>';
            btnBuyMegaStone.title = 'Você já usou sua Mega Stone nesta partida';
        } else if (canActiveMegaEvolve) {ad tournament state from server
            btnBuyMegaStone.innerHTML = `<span class="shop-item-icon">💎</span><span class="shop-item-name">Mega Evoluir ${activePokemon.name}</span><span class="shop-item-price">R$ ${TownState.shopPrices.mega_stone}</span>`;wait refreshTournamentState();
            btnBuyMegaStone.title = `Mega Evoluir ${activePokemon.name} → ${activePokemon.mega_name}`;
        } else {s
            btnBuyMegaStone.innerHTML = `<span class="shop-item-icon">💎</span><span class="shop-item-name">Mega Stone</span><span class="shop-item-price">R$ ${TownState.shopPrices.mega_stone}</span>`;
            btnBuyMegaStone.title = 'Selecione um Pokémon com Mega Evolução como ativo';
        }
    }
    etup Tournament Phase event listeners
    // Update stat boost button states
    const btnBuyHpBoost = document.getElementById('btn-buy-hp-boost');
    const btnBuyAttackBoost = document.getElementById('btn-buy-attack-boost');onst btnStartBattle = document.getElementById('btn-start-battle');
    const btnBuySpeedBoost = document.getElementById('btn-buy-speed-boost');ument.getElementById('btn-next-route');
    const hasActivePokemon = TownState.team.some(p => p.slot === TownState.activeSlot);
    / Remove old listeners by cloning
    if (btnBuyHpBoost) {
        btnBuyHpBoost.disabled = TownState.playerMoney < TownState.shopPrices.hp_boost || !hasActivePokemon;
    }   btnStartBattle.parentNode.replaceChild(newBtn, btnStartBattle);
    if (btnBuyAttackBoost) {    newBtn.addEventListener('click', startNextBattle);
        btnBuyAttackBoost.disabled = TownState.playerMoney < TownState.shopPrices.attack_boost || !hasActivePokemon;
    }
    if (btnBuySpeedBoost) {if (btnNextRoute) {
        btnBuySpeedBoost.disabled = TownState.playerMoney < TownState.shopPrices.speed_boost || !hasActivePokemon;NextRoute.cloneNode(true);
    }ode.replaceChild(newBtn, btnNextRoute);
        newBtn.addEventListener('click', completeTournament);
    // Render team grid
    renderTownTeamGrid();
    
    // Render players list/**
    renderTownPlayersList();Refresh Tournament State from server
    
    // Update ready buttonnc function refreshTournamentState() {
    updateReadyButton();
}
ate.roomCode}&player_id=${GameState.playerId}`,
/**        {},
 * Render Town Team Grid
 */    );
function renderTownTeamGrid() {
    const grid = document.getElementById('town-team-grid');    if (!result.success) {
    const activeInfo = document.getElementById('town-active-name');a ao carregar estado do torneio', 'error');
    
    if (!grid) return;    }
    
    grid.innerHTML = '';
    
    // Debug: log team datant.bye_player;
    console.log('Town Team Data:', TownState.team);.current_match;
    TournamentState.players = result.players;
    // Create 6 slots (max team size)e.completedMatches = result.tournament.completed_matches;
    for (let i = 0; i < 6; i++) {.total_matches;
        const pokemon = TownState.team.find(p => p.slot === i);ayer_id;
        const slot = document.createElement('div');rnament.is_tiebreaker || false;
        slot.className = 'town-pokemon-slot';tournament.tiebreaker_type || '';
        
        if (pokemon) {m.current_route;
            const isActive = i === TownState.activeSlot;
            const sellPrice = 2 + pokemon.evolution_stage;t match
            const canEvolve = pokemon.evolution_id != null;
            const expDisplay = pokemon.exp || 0;
            const canMegaEvolve = pokemon.has_mega && pokemon.mega_evolution_id && !pokemon.is_mega; TournamentState.currentMatch.player2?.id == GameState.playerId);
            const isMega = pokemon.is_mega;
            
            // Ensure we have a valid sprite URL
            const spriteUrl = pokemon.sprite_url || `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${pokemon.pokemon_id}.png`;
            console.log(`Pokemon ${pokemon.name} (ID: ${pokemon.pokemon_id}): sprite_url = ${spriteUrl}`);
            ', error);
            if (isActive) slot.classList.add('active');gar dados do torneio', 'error');
            if (isMega) slot.classList.add('mega-evolved');
            if (canMegaEvolve && TownState.hasMegaStone) slot.classList.add('can-mega-evolve');
            
            // Create image element separately to add load/error handlers
            const img = document.createElement('img');
            img.src = spriteUrl;
            img.alt = pokemon.name;header info
            img.className = 'team-pokemon-sprite';uteDisplay = document.getElementById('tournament-route');
            img.onload = () => console.log(`✓ Image loaded: ${pokemon.name}`);nt.getElementById('tournament-progress');
            img.onerror = () => {stBadge = document.getElementById('tournament-host-badge');
                console.error(`✗ Image FAILED: ${pokemon.name} - ${spriteUrl}`);ent-header h2');
                img.src = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/0.png';
            };
            lse;
            slot.appendChild(img);reakerType || '';
            
            // Add Mega badge if this Pokemon is mega evolvedbreaker) {
            if (isMega) {routeDisplay) routeDisplay.textContent = `⚔️ DESEMPATE`;
                const megaBadge = document.createElement('span');
                megaBadge.className = 'pokemon-mega-badge';=== 'final_tiebreaker' 
                megaBadge.textContent = 'MEGA';
                slot.appendChild(megaBadge);
            }
            
            // Add Mega evolution indicator if player has mega stone and Pokemon can mega evolvent = `Rota ${GameState.currentRoute}/8`;
            if (canMegaEvolve && TownState.hasMegaStone) {ournamentHeader) tournamentHeader.textContent = '🏆 Torneio';
                const megaIndicator = document.createElement('span');
                megaIndicator.className = 'pokemon-mega-indicator';
                megaIndicator.textContent = '💎';${TournamentState.completedMatches}/${TournamentState.totalMatches}`;
                megaIndicator.title = `Mega Evoluir ${activePokemon.name} → ${activePokemon.mega_name}`;
                slot.appendChild(megaIndicator);
            }d) === String(TournamentState.hostPlayerId);
            adge) {
            if (canEvolve) {isHost) {
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
                slot.appendChild(bonusBadge);urnament-brackets');
            }
            
            let tooltipText = `${pokemon.name}${isActive ? ' (Ativo)' : ''}${isMega ? ' (MEGA)' : ''}\nHP: ${pokemon.hp}${bonusHp > 0 ? `(+${bonusHp})` : ''} | ATQ: ${pokemon.attack}${bonusAtk > 0 ? `(+${bonusAtk})` : ''} | VEL: ${pokemon.speed}${bonusSpd > 0 ? `(+${bonusSpd})` : ''}`;
            if (canEvolve) tooltipText += `\nEXP: ${expDisplay}/5`;
            if (canMegaEvolve) tooltipText += `\n💎 Pode Mega Evoluir → ${pokemon.mega_name}`;=== 0) {
            tooltipText += `\nVender por R$${sellPrice}`;rtida agendada</p>';
            slot.title = tooltipText;eturn;
            
            slot.addEventListener('click', () => handleTownPokemonClick(pokemon, i));
        } else {ournamentState.brackets.forEach((bracket, index) => {
            slot.classList.add('empty');    const matchEl = document.createElement('div');
            slot.innerHTML = '<span class="pokemon-name">Vazio</span>';ket-match';
        }
        his is an NPC battle
        grid.appendChild(slot);;
    }   
           // Determine match status
    // Update active Pokemon name        if (bracket.status === 'completed') {
    const activePokemon = TownState.team.find(p => p.slot === TownState.activeSlot);         matchEl.classList.add('completed');
    if (activeInfo) {{
        activeInfo.textContent = activePokemon ? activePokemon.name : '---';         matchEl.classList.add('current');
    }.match_index === bracket.match_index) {
}

/**
 * Handle clicking on a Pokemon in the town team griding
 */
function handleTownPokemonClick(pokemon, slot) {hEl.classList.add('npc-battle');
    // If clicking the active Pokemon, show sell confirmation
    if (slot === TownState.activeSlot) {
        // Only show sell option if we have more than 1 Pokemont player1 = bracket.player1;
        if (TownState.team.length > 1) {player2;
            showSellConfirmation(pokemon);nner_id;
        } else {   
            showToast('Não pode vender seu último Pokémon!', 'warning');       const avatar1 = player1 ? (AVATARS[player1.avatar - 1] || '😎') : '?';
        }        // For NPC, use their emoji avatar directly
    } else {     const avatar2 = player2?.is_npc ? player2.avatar : (player2 ? (AVATARS[player2.avatar - 1] || '😎') : '?');
        // Set as active Pokemon
        setTownActivePokemon(slot);     const player1Class = winnerId ? (winnerId == player1?.id ? 'winner' : 'loser') : '';
    }nnerId == player2?.id ? 'winner' : 'loser') : '';
}

/**) {
 * Set active Pokemon (Town Phase)ner-badge">✓ ${bracket.winner?.name || 'Vencedor'}</span>`;
 */cket.status === 'in_progress') {
async function setTownActivePokemon(slot) { resultHtml = `<span class="pending">⚔️ Em Andamento</span>`;
    try {} else {
        const result = await apiCall('api/town.php?action=set_active', {an class="pending">Pendente</span>`;
            room_code: GameState.roomCode,
            player_id: GameState.playerId,
            slot: slotsplay (handle NPC differently)
        });er2Html = '';
        
        if (result.success) {   player2Html = `
            TownState.activeSlot = slot;class="bracket-player npc-player ${player2Class}">
            showToast(result.message, 'success');tar">${avatar2}</span>
            renderTownUI();
        } else {                   <div class="bracket-player-name npc-name">${player2.name}</div>
            showToast(result.error || 'Falha ao trocar Pokémon', 'error');                       <div class="bracket-player-title">${player2.title || 'Líder de Ginásio'}</div>
        }                    </div>
    } catch (error) {             </div>
        console.error('Error setting active Pokemon:', error);
        showToast('Falha ao trocar Pokémon', 'error');     } else {
    }
}ayer2Class}">
                <span class="bracket-player-avatar">${avatar2}</span>
/**o">
 * Show sell confirmation modal                    <div class="bracket-player-name">${player2?.name || 'A definir'}</div>
 */     <div class="bracket-player-badges">🎖️ ${player2?.badges || 0}</div>
function showSellConfirmation(pokemon) {
    TownState.selectedPokemonForSell = pokemon;
    
    const sellPrice = 2 + pokemon.evolution_stage;
    
    // Create modal
    const overlay = document.createElement('div');">${isNpcBattle ? '🏟️ Desafio de Ginásio' : `Partida ${index + 1}`}</div>
    overlay.className = 'sell-modal-overlay';
    overlay.id = 'sell-modal-overlay';{player1Class}">
    overlay.innerHTML = `pan>
        <div class="sell-modal">  <div class="bracket-player-info">
            <h3>Vender Pokémon?</h3>player-name">${player1?.name || 'TBD'}</div>
            <div class="sell-modal-pokemon">0}</div>
                <img src="${pokemon.sprite_url}" alt="${pokemon.name}">
                <span>${pokemon.name}</span>div>
                <span class="sell-modal-price">R$ ${sellPrice}</span>  <span class="bracket-vs">VS</span>
            </div>          ${player2Html}
            <div class="sell-modal-actions">        </div>
                <button class="btn btn-danger" id="btn-confirm-sell">Vender</button>>${resultHtml}</div>
                <button class="btn btn-secondary" id="btn-cancel-sell">Cancelar</button>    `;
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    // Setup modal buttons* Render Bye Player
    document.getElementById('btn-confirm-sell').addEventListener('click', confirmSellPokemon); */
    document.getElementById('btn-cancel-sell').addEventListener('click', closeSellModal);ction renderByePlayer() {
    overlay.addEventListener('click', (e) => {t.getElementById('tournament-bye');
        if (e.target === overlay) closeSellModal(); const byePlayerInfo = document.getElementById('bye-player-info');
    });
}

/**
 * Close sell confirmation modal       byeContainer.classList.remove('hidden');
 */        const avatar = AVATARS[TournamentState.byePlayer.avatar - 1] || '😎';
function closeSellModal() {     
    const overlay = document.getElementById('sell-modal-overlay');
    if (overlay) overlay.remove();         <span class="bye-player-avatar">${avatar}</span>
    TownState.selectedPokemonForSell = null;ame">${TournamentState.byePlayer.name}</span>
}rnamentState.byePlayer.badges}</span>

/**} else {
 * Confirm and execute Pokemon saleclassList.add('hidden');
 */}
async function confirmSellPokemon() {
    const pokemon = TownState.selectedPokemonForSell;
    if (!pokemon) return;
    
    closeSellModal();
    nderCurrentMatchPanel() {
    try {t matchPanel = document.getElementById('current-match-panel');
        const result = await apiCall('api/town.php?action=sell_pokemon', {ument.getElementById('tournament-complete-panel');
            room_code: GameState.roomCode,'match-preview');
            player_id: GameState.playerId,tn-start-battle');
            team_id: pokemon.team_id
        });
        nel || !completePanel) return;
        if (result.success) {
            showToast(result.message, 'success');eck if tournament is complete
            TownState.playerMoney = result.new_money;omplete = TournamentState.brackets.every(b => b.status === 'completed');
            addTownLogMessage(`Vendeu ${pokemon.name} por R$${result.sell_price}`, 'sell');
            await refreshTownState();
        } else {onsole.log('Host check:', {
            showToast(result.error || 'Falha ao vender Pokémon', 'error');       playerId: GameState.playerId,
        }        hostPlayerId: TournamentState.hostPlayerId,
    } catch (error) {     areEqual: String(GameState.playerId) === String(TournamentState.hostPlayerId)
        console.error('Error selling Pokemon:', error);
        showToast('Erro ao vender Pokémon', 'error'); 
    }tate.playerId) === String(TournamentState.hostPlayerId);
}

/**nel.classList.add('hidden');
 * Buy Ultra Ball   completePanel.classList.remove('hidden');
 */    
async function buyUltraBall() {/ Only host can advance to next route
    if (TownState.playerMoney < 3) {
        showToast('Dinheiro insuficiente!', 'warning');mentById('tournament-complete-waiting');
        return;
    }(btnNextRoute) {
        if (isHost) {
    try {classList.remove('hidden');
        const result = await apiCall('api/town.php?action=buy_ultra_ball', {
            room_code: GameState.roomCode,
            player_id: GameState.playerId
        });
        
        if (result.success) {hide waiting message for non-hosts
            TownState.playerMoney = result.new_money;
            TownState.ultraBalls = result.new_ultra_balls;   if (isHost) {
            showToast(result.message, 'success');ngMsg.classList.add('hidden');
            addTownLogMessage('Comprou Ultra Ball!', 'purchase');
            renderTownUI();
        } else {       }
            showToast(result.error || 'Falha na compra', 'error');       }
        }        return;
    } catch (error) { }
        console.error('Error buying ultra ball:', error);
        showToast('Erro ao comprar Ultra Ball', 'error'); matchPanel.classList.remove('hidden');
    }dd('hidden');
}

/** {
 * Buy Evo Soda   matchPreview.innerHTML = '<p>Aguardando próxima partida...</p>';
 */    if (btnStartBattle) btnStartBattle.classList.add('hidden');
async function buyEvoSoda() {eturn;
    if (TownState.playerMoney < 1) {
        showToast('Dinheiro insuficiente!', 'warning');
        return;
    }layer2 = match.player2;
    
    try { {
        const result = await apiCall('api/town.php?action=buy_evo_soda', { da partida...</p>';
            room_code: GameState.roomCode,
            player_id: GameState.playerId
        });
        
        if (result.success) {AVATARS[player2.avatar - 1] || '😎';
            TownState.playerMoney = result.new_money;
            showToast(result.message, 'success');layer1 = player1.id == GameState.playerId;
            Player2 = player2.id == GameState.playerId;
            if (result.evolved) {
                addTownLogMessage(`🎉 ${result.evolved_to} evoluiu!`, 'evolution');ElementById('match-player1').className = `match-player ${isPlayer1 ? 'is-you' : ''}`;
            } else {
                addTownLogMessage('Usou Evo Soda - +1 EXP!', 'purchase');div class="match-player-avatar">${avatar1}</div>
            }atch-player-name">${player1.name}${isPlayer1 ? ' (Você)' : ''}</div>
            badges}</div>
            await refreshTownState();
        } else {
            showToast(result.error || 'Falha na compra', 'error');   document.getElementById('match-player2').className = `match-player ${isPlayer2 ? 'is-you' : ''}`;
        }    document.getElementById('match-player2').innerHTML = `
    } catch (error) {     <div class="match-player-avatar">${avatar2}</div>
        console.error('Error buying evo soda:', error);s="match-player-name">${player2.name}${isPlayer2 ? ' (Você)' : ''}</div>
        showToast('Erro ao comprar Evo Soda', 'error');     <div class="match-player-badges">🎖️ ${player2.badges}</div>
    }
}

/**tBattle && matchWaiting) {
 * Buy Mega Stone   if (isHost) {
 */        btnStartBattle.classList.remove('hidden');
async function buyMegaStone() {
    if (TownState.playerMoney < TownState.shopPrices.mega_stone) {
        showToast('Dinheiro insuficiente!', 'warning');{
        return;       btnStartBattle.classList.add('hidden');
    }        matchWaiting.classList.remove('hidden');
    entState.isParticipant 
    if (TownState.hasMegaStone || TownState.usedMegaStone) {
        showToast('Você só pode usar uma Mega Stone por partida!', 'warning');
        return;
    }
    
    // Check if active Pokemon can Mega Evolve
    const activePokemon = TownState.team.find(p => p.slot === TownState.activeSlot);
    if (!activePokemon || !activePokemon.has_mega || !activePokemon.mega_evolution_id || activePokemon.is_mega) {
        showToast('Selecione um Pokémon com Mega Evolução como ativo!', 'warning');
        return;
    }mentById('tournament-standings-list');
    andingsList) return;
    try {
        // Buy Mega Stone and Mega Evolve in one action '';
        const result = await apiCall('api/town.php?action=buy_and_mega_evolve', {
            room_code: GameState.roomCode,win
            player_id: GameState.playerId
        });
        
        if (result.success) {standings-goal">🎯 Meta: ${badgesToWin} insígnias para vencer!</span>`;
            TownState.playerMoney = result.new_money;t.appendChild(header);
            TownState.hasMegaStone = false;
            TownState.usedMegaStone = true;rt players by badges, then by money
            showToast(`💎 ${activePokemon.name} Mega Evoluiu para ${result.mega_name}!`, 'success');rs = [...TournamentState.players].sort((a, b) => {
            addTownLogMessage(`💎 ${activePokemon.name} Mega Evoluiu para ${result.mega_name}!`, 'mega-evolution');dges;
            await refreshTownState();
        } else {);
            showToast(result.error || 'Falha na Mega Evolução', 'error');   
        }    sortedPlayers.forEach((player, index) => {
    } catch (error) {     const rank = index + 1;
        console.error('Error buying mega stone:', error);lver' : (rank === 3 ? 'bronze' : ''));
        showToast('Erro ao comprar Mega Stone', 'error');     const avatar = AVATARS[player.avatar_id - 1] || '😎';
    }State.playerId;
}>= badgesToWin - 1; // 4+ badges

/**    
 * Buy a stat boost (HP, Attack, or Speed) for the active PokemonElement('div');
 */? 'is-you' : ''} ${closeToWin ? 'close-to-win' : ''} ${isWinner ? 'has-won' : ''}`;
async function buyStatBoost(statType) {
    const priceKey = `${statType}_boost`;   const badgesDisplay = `${player.badges}/${badgesToWin}`;
    const price = TownState.shopPrices[priceKey] || 2;    
    
    if (TownState.playerMoney < price) {standings-rank ${rankClass}">#${rank}</span>
        showToast('Dinheiro insuficiente!', 'warning');atar}</span>
        return;v class="standings-player-info">
    }           <div class="standings-player-name">${player.player_name}${isYou ? ' (Você)' : ''}</div>
                <div class="standings-player-badges">🎖️ ${badgesDisplay} ${isWinner ? '👑' : ''}</div>
    const activePokemon = TownState.team.find(p => p.slot === TownState.activeSlot);   </div>
    if (!activePokemon) {
        showToast('Nenhum Pokémon ativo!', 'warning');
        return;
    }ndingsList.appendChild(playerEl);
    
    try {
        const result = await apiCall(`api/town.php?action=buy_${statType}_boost`, {
            room_code: GameState.roomCode,
            player_id: GameState.playerId next battle
        });
        
        if (result.success) {) {
            TownState.playerMoney = result.new_money;t('Nenhuma partida disponível', 'warning');
            showToast(result.message, 'success');
            
            const statNames = { hp: 'HP', attack: 'Ataque', speed: 'Velocidade' };
            addTownLogMessage(`${result.pokemon_name} ganhou +${result.bonus_value} ${statNames[statType]}!`, 'purchase');
            await refreshTownState();mentState.hostPlayerId)) {
        } else {   showToast('Apenas o anfitrião pode iniciar batalhas', 'warning');
            showToast(result.error || 'Falha na compra', 'error');       return;
        }    }
    } catch (error) { 
        console.error(`Error buying ${statType} boost:`, error);
        showToast('Erro ao comprar boost', 'error'); 
    }
}ament.php', {
        action: 'start_match',
/**de: GameState.roomCode,
 * Show Mega Evolution confirmation modaltch.match_index,
 */
function showMegaEvolutionConfirmation(pokemon) {
    TownState.selectedPokemonForMega = pokemon;
    
    // Create modalndo!', 'success');
    const overlay = document.createElement('div');andled by SSE
    overlay.className = 'sell-modal-overlay mega-evolution-modal';
    overlay.id = 'mega-evolution-modal-overlay';
    overlay.innerHTML = `
        <div class="sell-modal mega-modal">
            <h3>💎 Mega Evolução</h3> error);
            <div class="mega-evolution-preview">ror');
                <div class="mega-pokemon-before">
                    <img src="${pokemon.sprite_url}" alt="${pokemon.name}">
                    <span>${pokemon.name}</span>
                </div>
                <div class="mega-arrow">→</div>
                <div class="mega-pokemon-after">
                    <img src="${pokemon.mega_sprite_url}" alt="${pokemon.mega_name}">e
                    <span>${pokemon.mega_name}</span>
                </div>
            </div>an advance to next route
            <p class="mega-warning">⚠️ Você só pode usar UMA Mega Stone por partida!</p>(GameState.playerId) !== String(TournamentState.hostPlayerId)) {
            <p class="mega-info">A Mega Evolução é permanente durante o jogo.</p>  showToast('Apenas o anfitrião pode avançar para a próxima rota', 'warning');
            <div class="sell-modal-buttons">    return;
                <button class="btn-cancel" onclick="closeMegaEvolutionModal()">Cancelar</button>
                <button class="btn-mega-confirm" onclick="confirmMegaEvolution()">💎 Mega Evoluir!</button>   
            </div>    setLoading(true);
        </div> 
    `;
         const result = await apiCall('api/tournament.php', {
    document.body.appendChild(overlay);ment',
}
_id: GameState.playerId
/**
 * Close Mega Evolution modal   
 */
function closeMegaEvolutionModal() {           if (result.game_finished) {
    const overlay = document.getElementById('mega-evolution-modal-overlay');                showToast(`🏆 ${result.winner.name} venceu o jogo!`, 'success');
    if (overlay) {             // Will transition to victory screen via SSE
        overlay.remove();
    }             showToast(`Avançando para a Rota ${result.new_route}!`, 'success');
    TownState.selectedPokemonForMega = null;atching phase via SSE
}

/**        showToast(result.error || 'Falha ao completar torneio', 'error');
 * Confirm Mega Evolution
 */} catch (error) {
async function confirmMegaEvolution() {onsole.error('Error completing tournament:', error);
    const pokemon = TownState.selectedPokemonForMega;
    if (!pokemon) return;
    
    closeMegaEvolutionModal();
    
    try {
        const result = await apiCall('api/town.php?action=mega_evolve', {
            room_code: GameState.roomCode,
            player_id: GameState.playerId,
            team_id: pokemon.team_id
        });
        
        if (result.success) {tType) {
            TownState.hasMegaStone = false;
            TownState.usedMegaStone = true;   console.log('Battle started event - transitioning to battle screen');
            showToast(result.message, 'success');if this is an NPC battle
            addTownLogMessage(`💎 ${pokemon.name} Mega Evoluiu para ${result.mega_name}!`, 'mega-evolution');
            await refreshTownState();|| 'Líder de Ginásio';
        } else {           const npcTitle = data.player2?.title || '';
            showToast(result.error || 'Falha na Mega Evolução', 'error');               showToast(`🏟️ Desafio de Ginásio: ${data.player1?.name} vs ${npcName}!`, 'info');
        }            } else {
    } catch (error) {             showToast(`Batalha: ${data?.player1?.name || 'Jogador 1'} vs ${data?.player2?.name || 'Jogador 2'}!`, 'info');
        console.error('Error mega evolving:', error);
        showToast('Erro ao Mega Evoluir', 'error');         // Transition to battle screen
    }'battle');
}   break;

/**
 * Toggle ready status} venceu a partida!`, 'info');
 */ refreshTournamentState();
async function toggleTownReady() {    break;
    try {
        const result = await apiCall('api/town.php?action=toggle_ready', {
            room_code: GameState.roomCode,te();
            player_id: GameState.playerIdbreak;
        });
        
        if (result.success) {🏆 ${data.winner_name} venceu o jogo!`;
            TownState.isReady = result.is_ready;
            updateReadyButton();   winMessage = `🏆 ${data.winner_name} venceu com ${data.badges || 5} insígnias!`;
            } else if (data.win_type === 'most_badges') {
            // Update ready status displaydata.winner_name} venceu com mais insígnias!`;
            const readyStatus = document.getElementById('town-ready-status');
            if (readyStatus) { o desempate e o jogo!`;
                readyStatus.textContent = `${result.ready_count}/${result.total_players} jogadores prontos`;
            }
            andleGameStateChange('finished');
            if (result.all_ready) {k;
                showToast('Todos os jogadores prontos! Iniciando Torneio...', 'success');
                // Game state change will be handled by SSE
            } else {
                showToast(result.is_ready ? 'Você está pronto!' : 'Pronto cancelado', 'info');
            }
        } else {==========================================
            showToast(result.error || 'Falha ao atualizar status de pronto', 'error');
        }// ============================================
    } catch (error) {BATTLE PHASE FUNCTIONS
        console.error('Error toggling ready:', error);===================
        showToast('Erro ao atualizar status de pronto', 'error');
    }
}

/**c function initBattlePhase() {
 * Update ready button stateg Battle Phase...');
 */tate.roomCode);
function updateReadyButton() {
    const btn = document.getElementById('btn-town-ready'); any existing auto-turn timer
    if (!btn) return;
    Timer);
    if (TownState.isReady) {   BattleState.autoTurnTimer = null;
        btn.textContent = 'Cancelar Pronto';}
        btn.classList.add('is-ready');
    } else {
        btn.textContent = 'Pronto para Torneio';
        btn.classList.remove('is-ready');essages.innerHTML = '';
    }
       console.error('DOM.battleLogMessages not found!');
    // Update ready count   }
    const readyCount = TownState.players.filter(p => p.is_ready).length;    
    const readyStatus = document.getElementById('town-ready-status'); // Fetch current battle state
    if (readyStatus) {
        readyStatus.textContent = `${readyCount}/${TownState.players.length} jogadores prontos`;     console.log('Fetching battle state...');
    }ll(`${API.tournament}?action=get_battle_state&room_code=${GameState.roomCode}&player_id=${GameState.playerId}`, {}, 'GET');
}
attle state result:', result);
/**    
 * Render players list in towness) {
 */        console.error('Battle state fetch failed:', result.error);
function renderTownPlayersList() {lha ao carregar batalha', 'error');
    const list = document.getElementById('town-players-list');
    if (!list) return;
    
    list.innerHTML = '';
    
    TownState.players.forEach(player => {// Store NPC battle info
        const card = document.createElement('div');e || battleState.is_npc_battle || false;
        card.className = 'town-player-card';tleState.npc_data || null;
        
        if (player.is_ready) card.classList.add('ready'); are a participant (player1 is always human in NPC battles)
        if (player.id == GameState.playerId) card.classList.add('is-self');tleState.player1_id || 
        eState.isNpcBattle && GameState.playerId == battleState.player2_id));
        const avatarIndex = (player.avatar || 1) - 1;
        const avatar = AVATARS[avatarIndex] || '😎';
        tate
        card.innerHTML = `ttleState.player1 = result.player1;
            <div class="town-player-avatar">${avatar}</div>BattleState.player2 = result.player2;
            <div class="town-player-info"> = battleState.player1_team;
                <span class="town-player-name">${escapeHtml(player.player_name)}</span> BattleState.player2Team = battleState.player2_team;
                <span class="town-player-status">${player.is_ready ? '✓ Ready' : 'Shopping...'}</span>       BattleState.player1Active = battleState.player1_active;
            </div>        BattleState.player2Active = battleState.player2_active;
        `;     BattleState.player1HasSelected = battleState.player1_has_selected || (battleState.player1_active !== null);
        2HasSelected = battleState.player2_has_selected || (battleState.player2_active !== null);
        list.appendChild(card);     BattleState.phase = battleState.phase;
    });t_turn;
}
 = battleState.battle_log || [];
/**    BattleState.typeMatchups = result.type_matchups || null;
 * Add message to town log
 */
function addTownLogMessage(message, type = 'info') {
    const logMessages = document.getElementById('town-log-messages');    renderBattleArena();
    if (!logMessages) return;
    
    const entry = document.createElement('div');    
    entry.className = `log-entry log-${type}`;f in selection phase and we're a participant
    entry.innerHTML = `<span class="log-time">${new Date().toLocaleTimeString()}</span> ${message}`;&& BattleState.isMyBattle) {
    
    logMessages.appendChild(entry);           ? BattleState.player1HasSelected 
    logMessages.scrollTop = logMessages.scrollHeight;               : BattleState.player2HasSelected;
                
    // Keep only last 30 messages         if (!myHasSelected) {
    while (logMessages.children.length > 30) {onSelectionPanel();
        logMessages.removeChild(logMessages.firstChild);         } else {
    }
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
 */
function showPokemonSelectionPanel(isReplacement = false) {
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
}

/**
 * Hide Pokemon selection panel
 */
function hidePokemonSelectionPanel() {
    if (DOM.battleSelectionPanel) {
        DOM.battleSelectionPanel.classList.add('hidden');
    }
}

/**
 * Show waiting for opponent state
 */
function showWaitingForOpponent() {
    if (!DOM.battleSelectionPanel) return;
    
    DOM.battleSelectionPanel.classList.remove('hidden');
    DOM.battleSelectionPanel.classList.add('waiting');
    DOM.battleSelectionTitle.textContent = 'Aguardando oponente selecionar...';
    DOM.battleSelectionGrid.innerHTML = '<p style="color: var(--text-secondary);">Seu Pokémon está pronto!</p>';
}

/**
 * Select a Pokemon for battle
 */
async function selectBattlePokemon(teamIndex, isReplacement = false) {
    setLoading(true);
    
    try {
        const action = isReplacement ? 'select_replacement' : 'select_pokemon';
        const result = await apiCall(API.tournament, {
            action: action,
            room_code: GameState.roomCode,
            player_id: GameState.playerId,
            team_index: teamIndex
        });
        
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
        const result = await apiCall(API.tournament, {
            action: 'execute_turn',
            room_code: GameState.roomCode
        });
        
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
            const result = await apiCall(`${API.tournament}?action=get_battle_state&room_code=${GameState.roomCode}&player_id=${GameState.playerId}`, {}, 'GET');
            if (result.success) {
                BattleState.typeMatchups = result.type_matchups || null;
                // Also update team HP values
                BattleState.player1Team = result.battle_state.player1_team;
                BattleState.player2Team = result.battle_state.player2_team;
            }
        } catch (error) {
            console.error('Error fetching battle state for matchups:', error);
        }
        
        showPokemonSelectionPanel(true);
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
    
    // After a delay, return to tournament screen
    setTimeout(() => {
        handleGameStateChange('tournament');
        refreshTournamentState();
    }, 3500);
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
 */
async function checkExistingSession() {
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
                GameState.playerNumber = currentPlayer.player_number;
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
