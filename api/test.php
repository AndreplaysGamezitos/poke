<?php
/**
 * PokeFodase - Test API Endpoint
 * Used for verifying installation
 */

require_once __DIR__ . '/../config.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

$test = $_GET['test'] ?? 'php';

switch ($test) {
    case 'php':
        // Basic PHP test
        jsonResponse([
            'success' => true,
            'php_version' => phpversion(),
            'session_active' => session_status() === PHP_SESSION_ACTIVE,
            'extensions' => [
                'pdo' => extension_loaded('pdo'),
                'pdo_mysql' => extension_loaded('pdo_mysql'),
                'json' => extension_loaded('json')
            ]
        ]);
        break;
        
    case 'database':
        // Database connection test
        try {
            $db = getDB();
            
            // Get list of tables
            $stmt = $db->query("SHOW TABLES");
            $tables = $stmt->fetchAll(PDO::FETCH_COLUMN);
            
            jsonResponse([
                'success' => true,
                'message' => 'Database connected successfully',
                'tables' => $tables,
                'table_count' => count($tables)
            ]);
        } catch (PDOException $e) {
            jsonResponse([
                'success' => false,
                'error' => $e->getMessage()
            ], 500);
        }
        break;
        
    case 'config':
        // Config test (don't expose sensitive info)
        jsonResponse([
            'success' => true,
            'max_players' => MAX_PLAYERS,
            'badges_to_win' => BADGES_TO_WIN,
            'exp_to_evolve' => EXP_TO_EVOLVE
        ]);
        break;
        
    default:
        jsonResponse(['error' => 'Unknown test'], 400);
}
?>
