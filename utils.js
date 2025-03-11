const inquirer = require('inquirer');
const winston = require('winston');
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { HttpProxyAgent } = require('http-proxy-agent');

/**
 * Prompts the user for video URLs
 * @returns {Promise<string[]>} List of video URLs (1-3)
 */
async function getUserInput() {
    console.log(chalk.cyan('='.repeat(50)));
    console.log(chalk.green('Automated Video Watcher with Proxy Rotation'));
    console.log(chalk.cyan('='.repeat(50)));
    console.log(chalk.yellow('Please enter up to 3 video URLs (leave empty to skip):'));

    const urls = [];
    
    for (let i = 1; i <= 3; i++) {
        const { url } = await inquirer.prompt([
            {
                type: 'input',
                name: 'url',
                message: `Enter URL ${i}:`,
                validate: (input) => {
                    if (!input) return true; // Allow empty input
                    
                    // Simple URL validation
                    const urlPattern = /^(https?:\/\/)?([\w-]+(\.[\w-]+)+)([\w.,@?^=%&:/~+#-]*[\w@?^=%&/~+#-])?$/;
                    if (urlPattern.test(input)) {
                        return true;
                    }
                    return 'Please enter a valid URL or leave empty';
                }
            }
        ]);
        
        if (url) {
            urls.push(url);
        }
    }
    
    if (urls.length === 0) {
        console.log(chalk.red('No URLs provided. Exiting the script.'));
        return [];
    }
    
    console.log(chalk.green(`Received ${urls.length} URLs for automated watching.`));
    return urls;
}

/**
 * Prompts the user for proxy servers
 * @returns {Promise<string[]>} List of proxy servers
 */
async function getProxyInput() {
    console.log(chalk.cyan('='.repeat(50)));
    console.log(chalk.green('Proxy Configuration'));
    console.log(chalk.cyan('='.repeat(50)));
    console.log(chalk.yellow('Please enter your proxy servers (leave empty to use default/free proxies):'));
    console.log(chalk.yellow('Format: protocol://ip:port or protocol://username:password@ip:port'));
    console.log(chalk.yellow('Example: http://11.22.33.44:8080 or http://user:pass@11.22.33.44:8080'));

    const proxies = [];
    
    const { useProxies } = await inquirer.prompt([
        {
            type: 'confirm',
            name: 'useProxies',
            message: 'Do you want to use custom proxies?',
            default: false
        }
    ]);
    
    if (!useProxies) {
        console.log(chalk.yellow('Using default/free proxies.'));
        return [];
    }
    
    let addMore = true;
    let proxyCount = 0;
    
    while (addMore && proxyCount < 10) {
        const { proxy } = await inquirer.prompt([
            {
                type: 'input',
                name: 'proxy',
                message: `Enter proxy ${proxyCount + 1}:`,
                validate: (input) => {
                    if (!input) return true; // Allow empty input to stop
                    
                    // Simple proxy validation
                    const proxyPattern = /^(https?):\/\/([\w\d\-_.]+:[\w\d\-_.]+@)?([\w\d\-_.]+):(\d+)$/;
                    if (proxyPattern.test(input)) {
                        return true;
                    }
                    return 'Please enter a valid proxy URL or leave empty';
                }
            }
        ]);
        
        if (proxy) {
            proxies.push(proxy);
            proxyCount++;
        } else {
            addMore = false;
        }
        
        if (proxyCount > 0 && addMore) {
            const { continueAdding } = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'continueAdding',
                    message: 'Add another proxy?',
                    default: true
                }
            ]);
            
            addMore = continueAdding;
        }
    }
    
    if (proxies.length === 0) {
        console.log(chalk.yellow('No proxies provided. Using default/free proxies.'));
        return [];
    }
    
    console.log(chalk.green(`Added ${proxies.length} custom proxies.`));
    return proxies;
}

/**
 * Fetches proxies from the ProxyScrape API
 * @returns {Promise<string[]>} List of proxies
 */
async function fetchProxiesFromAPI() {
    try {
        const response = await axios.get('https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=10000&country=all&ssl=all&anonymity=all');
        
        if (response.status === 200 && response.data) {
            // Split response into lines and filter out empty lines
            const proxies = response.data
                .split('\n')
                .map(line => line.trim())
                .filter(line => line && line.includes(':'))
                .map(proxy => `http://${proxy}`);
            
            return proxies;
        }
    } catch (error) {
        console.error(`❌ Error fetching proxies from API: ${error.message}`);
    }
    
    return [];
}

/**
 * Fetches proxies from the GeoNode API
 * @param {string} apiKey - GeoNode API key (optional)
 * @returns {Promise<string[]>} List of proxies
 */
async function fetchProxiesFromGeoNode(apiKey = '') {
    try {
        const url = 'https://proxylist.geonode.com/api/proxy-list?anonymityLevel=anonymous&limit=500&page=1&sort_by=lastChecked&sort_type=desc';
        const config = apiKey ? { headers: { 'Authorization': `Token ${apiKey}` } } : {};
        
        const response = await axios.get(url, config);
        
        if (response.status === 200 && response.data && response.data.data) {
            // Parse the proxy data which is in the format shown in the example
            const proxies = response.data.data
                .filter(proxy => {
                    // Check if proxy has required fields and good metrics
                    return proxy.ip && 
                           proxy.port && 
                           proxy.protocols && 
                           proxy.protocols.length > 0 &&
                           proxy.anonymityLevel === 'anonymous' &&
                           proxy.latency < 1000; // Filter for faster proxies
                })
                .map(proxy => {
                    // Format: protocol://ip:port
                    const protocol = proxy.protocols.includes('https') ? 'https' : 'http';
                    return `${protocol}://${proxy.ip}:${proxy.port}`;
                });
            
            console.log(chalk.green(`✅ Successfully fetched ${proxies.length} proxies from GeoNode API`));
            
            // Log some stats about the proxies
            if (proxies.length > 0) {
                console.log(chalk.blue('📊 Proxy Statistics:'));
                console.log(chalk.blue(`   - Total proxies: ${proxies.length}`));
                console.log(chalk.blue(`   - Protocol distribution: ${getProtocolStats(proxies)}`));
            }
            
            return proxies;
        }
    } catch (error) {
        console.error(chalk.red(`❌ Error fetching proxies from GeoNode API: ${error.message}`));
    }
    
    return [];
}

/**
 * Get protocol distribution statistics
 * @param {string[]} proxies List of proxy URLs
 * @returns {string} Statistics string
 */
function getProtocolStats(proxies) {
    const stats = proxies.reduce((acc, proxy) => {
        const protocol = proxy.startsWith('https') ? 'https' : 'http';
        acc[protocol] = (acc[protocol] || 0) + 1;
        return acc;
    }, {});
    
    return Object.entries(stats)
        .map(([protocol, count]) => `${protocol}: ${count}`)
        .join(', ');
}

/**
 * Load proxies from a file
 * @param {string} filePath - Path to the proxy file
 * @returns {string[]} Array of proxy URLs
 */
function loadProxiesFromFile(filePath) {
    try {
        if (!fs.existsSync(filePath)) {
            console.error(`❌ Proxy file not found: ${filePath}`);
            return [];
        }
        
        const content = fs.readFileSync(filePath, 'utf8');
        return content
            .split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#'))
            .map(proxy => proxy.startsWith('http') ? proxy : `http://${proxy}`);
    } catch (error) {
        console.error(`❌ Error loading proxies from file: ${error.message}`);
        return [];
    }
}

/**
 * Sets up logging with Winston
 * @returns {winston.Logger} Configured logger
 */
function setupLogging() {
    return winston.createLogger({
        level: 'info',
        format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.printf(({ level, message, timestamp }) => {
                return `${timestamp} - ${level.toUpperCase()}: ${message}`;
            })
        ),
        transports: [
            new winston.transports.Console({
                format: winston.format.combine(
                    winston.format.colorize(),
                    winston.format.simple()
                )
            })
        ]
    });
}

// Create a logger instance
const log = setupLogging();

/**
 * Sleep for a specified duration
 * @param {number} ms - Duration in milliseconds
 * @returns {Promise<void>}
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get a random integer between min and max (inclusive)
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number}
 */
function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Test a proxy by making a request to a test URL
 * @param {string} proxy - Proxy URL to test
 * @returns {Promise<boolean>}
 */
async function testProxy(proxy) {
    try {
        const testUrl = 'http://example.com';
        const timeout = 10000; // 10 seconds
        
        const response = await axios.get(testUrl, {
            proxy: {
                host: proxy.split('://')[1].split(':')[0],
                port: parseInt(proxy.split(':').pop()),
                protocol: proxy.split('://')[0]
            },
            timeout
        });
        
        return response.status === 200;
    } catch (error) {
        return false;
    }
}

/**
 * Save proxies to a file
 * @param {string[]} proxies - Array of proxy URLs
 * @param {string} filePath - Path to save the proxies
 */
function saveProxiesToFile(proxies, filePath) {
    try {
        const content = proxies.join('\n');
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`✅ Saved ${proxies.length} proxies to ${filePath}`);
    } catch (error) {
        console.error(`❌ Error saving proxies to file: ${error.message}`);
    }
}

module.exports = {
    getUserInput,
    getProxyInput,
    fetchProxiesFromAPI,
    fetchProxiesFromGeoNode,
    loadProxiesFromFile,
    saveProxiesToFile,
    getRandomInt,
    sleep,
    setupLogging,
    log
}; 