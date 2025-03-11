const inquirer = require('inquirer');
const fs = require('fs');
const path = require('path');
const { fetchProxiesFromAPI, fetchProxiesFromGeoNode, testProxy, loadProxiesFromFile, saveProxiesToFile, sleep } = require('./utils');
const ProxyManager = require('./proxyManager');
const VideoPlayer = require('./videoPlayer');

// Configuration
const CONFIG = {
    USE_PROXY_API: true,           // Whether to use the ProxyScrape API
    USE_GEONODE_API: true,         // Whether to use the GeoNode API
    GEONODE_API_KEY: '',          // Optional GeoNode API key
    PROXY_FILE: 'http_proxies.txt', // Fallback file for proxies
    MIN_WATCH_DURATION: 1140,      // Minimum watch duration in seconds (19 minutes)
    MAX_WATCH_DURATION: 1260,      // Maximum watch duration in seconds (21 minutes)
    VIEWS_PER_PROXY: 3,            // Number of views per proxy
    DELAY_BETWEEN_VIEWS: 10,       // Delay between views in seconds
    MAX_PROXY_FAILURES: 3,         // Maximum failures before a proxy is discarded
    SAVE_WORKING_PROXIES: true     // Whether to save working proxies to file
};

process.stdout.write('\x1b[2J\x1b[0f'); // Clear screen
process.stdout.write('🚀 Starting Video Watcher\n\n');

/**
 * Main function to run the video watcher
 */
async function main() {
    try {
        process.stdout.write('==================================\n');
        process.stdout.write('   Automated Video Watcher v1.0.0  \n');
        process.stdout.write('==================================\n\n');
        
        // Get video URL from user
        const { videoUrl } = await inquirer.prompt([
            {
                type: 'input',
                name: 'videoUrl',
                message: 'Enter the video URL:',
                validate: (input) => {
                    if (!input) return 'Please enter a valid URL';
                    if (!input.startsWith('http')) return 'URL must start with http:// or https://';
                    return true;
                }
            }
        ]);
        
        process.stdout.write(`📺 Video URL: ${videoUrl}\n`);
        
        // Get number of views from user
        const { viewCount } = await inquirer.prompt([
            {
                type: 'number',
                name: 'viewCount',
                message: 'How many views do you want to generate?',
                default: 10,
                validate: (input) => {
                    const num = parseInt(input);
                    if (isNaN(num) || num <= 0) return 'Please enter a positive number';
                    return true;
                }
            }
        ]);
        
        process.stdout.write(`🔢 View count: ${viewCount}\n`);
        
        // Initialize proxy manager
        let proxies = [];
        
        // Try to fetch proxies from GeoNode API if enabled
        if (CONFIG.USE_GEONODE_API) {
            process.stdout.write('🔄 Fetching proxies from GeoNode API...\n');
            const geoNodeProxies = await fetchProxiesFromGeoNode(CONFIG.GEONODE_API_KEY);
            proxies = [...proxies, ...geoNodeProxies];
            
            if (geoNodeProxies.length > 0) {
                process.stdout.write(`✅ Successfully fetched ${geoNodeProxies.length} proxies from GeoNode API\n`);
            } else {
                process.stdout.write('❌ Failed to fetch proxies from GeoNode API\n');
            }
        }
        
        // Try to fetch proxies from ProxyScrape API if enabled and we need more proxies
        if (CONFIG.USE_PROXY_API && proxies.length < viewCount) {
            process.stdout.write('🔄 Fetching additional proxies from ProxyScrape API...\n');
            const proxyScapeProxies = await fetchProxiesFromAPI();
            proxies = [...new Set([...proxies, ...proxyScapeProxies])]; // Remove duplicates
            
            if (proxyScapeProxies.length > 0) {
                process.stdout.write(`✅ Successfully fetched ${proxyScapeProxies.length} proxies from ProxyScrape API\n`);
            } else {
                process.stdout.write('❌ Failed to fetch proxies from ProxyScrape API\n');
            }
        }
        
        // If no proxies from API, try to load from file
        if (proxies.length === 0 && fs.existsSync(CONFIG.PROXY_FILE)) {
            process.stdout.write(`🔄 Loading proxies from file: ${CONFIG.PROXY_FILE}\n`);
            proxies = loadProxiesFromFile(CONFIG.PROXY_FILE);
            
            if (proxies.length > 0) {
                process.stdout.write(`✅ Successfully loaded ${proxies.length} proxies from file\n`);
            } else {
                process.stdout.write('❌ No valid proxies found in file\n');
            }
        }
        
        // If still no proxies, ask user to input manually
        if (proxies.length === 0) {
            const { manualProxies } = await inquirer.prompt([
                {
                    type: 'input',
                    name: 'manualProxies',
                    message: 'Enter proxies (one per line, format: ip:port):',
                    validate: (input) => {
                        if (!input) return 'Please enter at least one proxy';
                        return true;
                    }
                }
            ]);
            
            proxies = manualProxies
                .split('\n')
                .map(p => p.trim())
                .filter(p => p)
                .map(p => p.startsWith('http') ? p : `http://${p}`);
            
            process.stdout.write(`✅ Added ${proxies.length} proxies manually\n`);
        }
        
        // Initialize proxy manager with the collected proxies
        const proxyManager = new ProxyManager(proxies);
        await proxyManager.initialize();
        
        process.stdout.write(`🔌 Working with ${proxyManager.getWorkingProxyCount()} proxies\n`);
        
        // Initialize video player
        const videoPlayer = new VideoPlayer({
            minDuration: CONFIG.MIN_WATCH_DURATION,
            maxDuration: CONFIG.MAX_WATCH_DURATION
        });
        
        // Generate views
        let successfulViews = 0;
        let failedViews = 0;
        
        process.stdout.write(`🎬 Starting to generate ${viewCount} views...\n`);
        
        for (let i = 0; i < viewCount; i++) {
            // Check if we have working proxies
            if (proxyManager.getWorkingProxyCount() === 0) {
                process.stdout.write('❌ No working proxies available. Stopping.\n');
                break;
            }
            
            // Get a proxy
            const proxy = proxyManager.getNextProxy();
            
            if (!proxy) {
                process.stdout.write('❌ Failed to get a working proxy. Stopping.\n');
                break;
            }
            
            process.stdout.write(`\n🔄 View attempt ${i + 1}/${viewCount} using proxy: ${proxy}\n`);
            
            // Watch the video
            const success = await videoPlayer.watch(videoUrl, proxy);
            
            if (success) {
                successfulViews++;
                proxyManager.reportProxySuccess(proxy);
                process.stdout.write(`✅ View ${i + 1} successful! (Total: ${successfulViews}/${viewCount})\n`);
            } else {
                failedViews++;
                proxyManager.reportProxyFailure(proxy);
                process.stdout.write(`❌ View ${i + 1} failed! (Failed: ${failedViews})\n`);
            }
            
            // Delay between views
            if (i < viewCount - 1) {
                const delay = CONFIG.DELAY_BETWEEN_VIEWS * 1000;
                process.stdout.write(`⏱️ Waiting ${CONFIG.DELAY_BETWEEN_VIEWS} seconds before next view...\n`);
                await sleep(delay);
            }
        }
        
        // Save working proxies if enabled
        if (CONFIG.SAVE_WORKING_PROXIES) {
            const workingProxies = proxyManager.getWorkingProxies();
            if (workingProxies.length > 0) {
                const workingProxiesFile = 'working_proxies.txt';
                saveProxiesToFile(workingProxies, workingProxiesFile);
            }
        }
        
        // Summary
        process.stdout.write('\n📊 Summary:\n');
        process.stdout.write(`✅ Successful views: ${successfulViews}\n`);
        process.stdout.write(`❌ Failed views: ${failedViews}\n`);
        process.stdout.write(`🔌 Working proxies: ${proxyManager.getWorkingProxyCount()}\n`);
        
        process.stdout.write('\n🏁 Video Watcher completed!\n');
    } catch (error) {
        process.stdout.write(`❌ Error in main process: ${error.message}\n`);
        process.stdout.write(error.stack + '\n');
    }
}

// Run the main function
main(); 