const axios = require('axios');
const inquirer = require('inquirer');
const chalk = require('chalk');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { HttpProxyAgent } = require('http-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');
const { sleep } = require('./utils');

// Configuration
const CONFIG = {
    MIN_WATCH_DURATION: 1140, // 19 minutes
    MAX_WATCH_DURATION: 1260, // 21 minutes
    DELAY_BETWEEN_VIEWS: 10,  // 10 seconds
    MAX_RETRIES: 3,
    SUPPORTED_PROTOCOLS: ['http', 'https', 'socks4', 'socks5']
};

async function getVideoUrl() {
    const { url } = await inquirer.prompt([{
        type: 'input',
        name: 'url',
        message: 'Enter YouTube video URL:',
        validate: (input) => {
            if (!input) return 'Please enter a URL';
            if (!input.includes('youtube.com/watch?v=') && !input.includes('youtu.be/')) {
                return 'Please enter a valid YouTube URL';
            }
            return true;
        }
    }]);
    return url;
}

async function getViewCount() {
    const { count } = await inquirer.prompt([{
        type: 'number',
        name: 'count',
        message: 'How many views do you want to generate?',
        default: 100,
        validate: (input) => {
            const num = parseInt(input);
            if (isNaN(num) || num <= 0) return 'Please enter a positive number';
            return true;
        }
    }]);
    return count;
}

async function fetchProxies() {
    const allProxies = [];

    // GeoNode API
    try {
        console.log(chalk.blue('Fetching proxies from GeoNode API...'));
        const response = await axios.get('https://proxylist.geonode.com/api/proxy-list?limit=100&page=1&sort_by=lastChecked&sort_type=desc&filterUpTime=90&protocols=http%2Chttps%2Csocks4%2Csocks5&anonymityLevel=elite&anonymityLevel=anonymous');
        
        if (response.data && response.data.data) {
            const proxies = response.data.data.map(p => {
                const protocols = Array.isArray(p.protocols) ? p.protocols : [p.protocol];
                return protocols.map(protocol => ({
                    protocol: protocol.toLowerCase(),
                    host: p.ip,
                    port: p.port,
                    country: p.country,
                    anonymity: p.anonymityLevel
                }));
            }).flat();
            
            allProxies.push(...proxies);
            console.log(chalk.green(`Successfully fetched ${proxies.length} proxies from GeoNode`));
        }
    } catch (error) {
        console.error(chalk.red('Error fetching from GeoNode:', error.message));
    }

    // ProxyScrape API
    try {
        for (const protocol of CONFIG.SUPPORTED_PROTOCOLS) {
            console.log(chalk.blue(`Fetching ${protocol} proxies from ProxyScrape...`));
            const response = await axios.get(`https://api.proxyscrape.com/v2/?request=displayproxies&protocol=${protocol}&timeout=10000&country=all&ssl=all&anonymity=all`);
            
            const proxies = response.data
                .split('\n')
                .filter(Boolean)
                .map(proxy => proxy.trim())
                .filter(proxy => proxy.includes(':'))
                .map(proxy => ({
                    protocol,
                    host: proxy.split(':')[0],
                    port: parseInt(proxy.split(':')[1]),
                    country: 'Unknown',
                    anonymity: 'Unknown'
                }));

            allProxies.push(...proxies);
            console.log(chalk.green(`Successfully fetched ${proxies.length} ${protocol} proxies from ProxyScrape`));
        }
    } catch (error) {
        console.error(chalk.red('Error fetching from ProxyScrape:', error.message));
    }

    return allProxies;
}

function getProxyAgent(proxy) {
    const { protocol, host, port, username, password } = proxy;
    const auth = username && password ? `${username}:${password}@` : '';
    const proxyUrl = `${protocol}://${auth}${host}:${port}`;

    switch (protocol) {
        case 'http':
            return new HttpProxyAgent(proxyUrl);
        case 'https':
            return new HttpsProxyAgent(proxyUrl);
        case 'socks4':
        case 'socks5':
            return new SocksProxyAgent(proxyUrl);
        default:
            throw new Error(`Unsupported protocol: ${protocol}`);
    }
}

async function testProxy(proxy) {
    try {
        const agent = getProxyAgent(proxy);
        const axiosConfig = {
            httpsAgent: agent,
            httpAgent: agent,
            timeout: 30000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1'
            },
            validateStatus: function (status) {
                return status >= 200 && status < 400;
            }
        };

        await axios.get('https://www.youtube.com', axiosConfig);
        return true;
    } catch (error) {
        return false;
    }
}

async function watchVideo(url, proxy) {
    try {
        const agent = getProxyAgent(proxy);
        const axiosConfig = {
            httpsAgent: agent,
            httpAgent: agent,
            timeout: 30000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1'
            }
        };

        console.log(chalk.blue(`Testing proxy ${proxy.protocol}://${proxy.host}:${proxy.port}...`));
        const isWorking = await testProxy(proxy);
        if (!isWorking) {
            throw new Error('Proxy test failed');
        }

        console.log(chalk.blue(`Accessing video with proxy...`));
        await axios.get(url, axiosConfig);
        
        const watchDuration = Math.floor(Math.random() * (CONFIG.MAX_WATCH_DURATION - CONFIG.MIN_WATCH_DURATION + 1)) + CONFIG.MIN_WATCH_DURATION;
        console.log(chalk.blue(`Watching video for ${watchDuration} seconds...`));
        await sleep(watchDuration * 1000);
        return true;
    } catch (error) {
        if (error.code === 'ECONNREFUSED') {
            console.error(chalk.red(`Connection refused by proxy ${proxy.protocol}://${proxy.host}:${proxy.port}`));
        } else if (error.code === 'ETIMEDOUT') {
            console.error(chalk.red(`Connection timed out for proxy ${proxy.protocol}://${proxy.host}:${proxy.port}`));
        } else {
            console.error(chalk.red(`Error with proxy ${proxy.protocol}://${proxy.host}:${proxy.port}:`, error.message));
        }
        return false;
    }
}

async function main() {
    console.log(chalk.green('=== YouTube View Generator ==='));
    
    const videoUrl = await getVideoUrl();
    const viewCount = await getViewCount();
    
    console.log(chalk.yellow('Initializing...'));
    let proxies = await fetchProxies();
    
    if (proxies.length === 0) {
        console.error(chalk.red('No proxies available. Exiting...'));
        return;
    }

    console.log(chalk.green(`Starting to generate ${viewCount} views with ${proxies.length} proxies...`));
    console.log(chalk.blue('Testing proxies...'));
    
    // Test proxies in parallel
    const proxyTests = await Promise.all(
        proxies.map(async proxy => ({
            proxy,
            working: await testProxy(proxy)
        }))
    );
    
    // Filter working proxies
    proxies = proxyTests
        .filter(test => test.working)
        .map(test => test.proxy);
    
    console.log(chalk.green(`Found ${proxies.length} working proxies`));
    
    if (proxies.length === 0) {
        console.error(chalk.red('No working proxies available. Exiting...'));
        return;
    }

    let successfulViews = 0;
    let currentProxyIndex = 0;

    while (successfulViews < viewCount) {
        const proxy = proxies[currentProxyIndex];
        console.log(chalk.blue(`\nAttempt ${successfulViews + 1}/${viewCount} using proxy: ${proxy.protocol}://${proxy.host}:${proxy.port}`));
        
        const success = await watchVideo(videoUrl, proxy);
        
        if (success) {
            successfulViews++;
            console.log(chalk.green(`✓ View ${successfulViews} successful!`));
        } else {
            console.log(chalk.red('✗ View failed, trying next proxy...'));
        }

        // Move to next proxy
        currentProxyIndex = (currentProxyIndex + 1) % proxies.length;
        
        // If we've gone through all proxies, fetch new ones
        if (currentProxyIndex === 0) {
            console.log(chalk.yellow('Refreshing proxy list...'));
            const newProxies = await fetchProxies();
            if (newProxies.length > 0) {
                const proxyTests = await Promise.all(
                    newProxies.map(async proxy => ({
                        proxy,
                        working: await testProxy(proxy)
                    }))
                );
                proxies = proxyTests
                    .filter(test => test.working)
                    .map(test => test.proxy);
            }
        }

        // Wait between views
        if (successfulViews < viewCount) {
            console.log(chalk.blue(`Waiting ${CONFIG.DELAY_BETWEEN_VIEWS} seconds before next view...`));
            await sleep(CONFIG.DELAY_BETWEEN_VIEWS * 1000);
        }
    }

    console.log(chalk.green('\n=== Summary ==='));
    console.log(chalk.green(`Successfully generated ${successfulViews} views`));
}

// Create utils.js if it doesn't exist
const fs = require('fs');
if (!fs.existsSync('utils.js')) {
    fs.writeFileSync('utils.js', `
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { sleep };
    `.trim());
}

main().catch(error => {
    console.error(chalk.red('Fatal error:', error.message));
    process.exit(1);
});
