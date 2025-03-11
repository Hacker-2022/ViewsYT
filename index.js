const axios = require('axios');
const inquirer = require('inquirer');
const chalk = require('chalk');
const cliProgress = require('cli-progress');
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
    SUPPORTED_PROTOCOLS: ['http', 'https', 'socks4', 'socks5'],
    PROXY_TEST_TIMEOUT: 5000,  // 5 seconds timeout for testing each proxy
    PROXY_VERIFICATION_BATCH_SIZE: 5 // Verify 5 proxies at a time when needed
};

// Progress bars
const multibar = new cliProgress.MultiBar({
    clearOnComplete: false,
    hideCursor: true,
    format: '{bar} {percentage}% | {value}/{total} | {status}'
}, cliProgress.Presets.shades_grey);

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
                    anonymity: p.anonymityLevel,
                    verified: false
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
                    anonymity: 'Unknown',
                    verified: false
                }));

            allProxies.push(...proxies);
            console.log(chalk.green(`Successfully fetched ${proxies.length} ${protocol} proxies from ProxyScrape`));
        }
    } catch (error) {
        console.error(chalk.red('Error fetching from ProxyScrape:', error.message));
    }

    // Shuffle the proxies for better distribution
    return allProxies.sort(() => Math.random() - 0.5);
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
            timeout: CONFIG.PROXY_TEST_TIMEOUT,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1'
            }
        };

        await axios.get('https://www.youtube.com', axiosConfig);
        proxy.verified = true;
        return true;
    } catch (error) {
        return false;
    }
}

async function verifyNextProxies(proxies, startIndex, requiredCount) {
    const endIndex = Math.min(startIndex + CONFIG.PROXY_VERIFICATION_BATCH_SIZE, proxies.length);
    const batch = proxies.slice(startIndex, endIndex);
    const progressBar = multibar.create(batch.length, 0, { status: 'Verifying proxies...' });
    
    const results = await Promise.all(
        batch.map(async (proxy) => {
            if (proxy.verified) return true;
            
            progressBar.increment(0, { 
                status: `Testing ${proxy.protocol}://${proxy.host}:${proxy.port}`
            });
            
            const working = await testProxy(proxy);
            progressBar.increment(1);
            
            if (working) {
                console.log(chalk.green(`\n✓ Working proxy found: ${proxy.protocol}://${proxy.host}:${proxy.port}`));
            }
            return working;
        })
    );

    progressBar.stop();
    return results.filter(r => r).length;
}

async function watchVideo(url, proxy) {
    const progressBar = multibar.create(100, 0, { status: 'Starting view...' });
    
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

        // Only test if not verified
        if (!proxy.verified) {
            progressBar.update(10, { status: 'Testing proxy...' });
            const isWorking = await testProxy(proxy);
            if (!isWorking) {
                throw new Error('Proxy test failed');
            }
        }

        progressBar.update(20, { status: 'Accessing video...' });
        await axios.get(url, axiosConfig);
        
        const watchDuration = Math.floor(Math.random() * (CONFIG.MAX_WATCH_DURATION - CONFIG.MIN_WATCH_DURATION + 1)) + CONFIG.MIN_WATCH_DURATION;
        const updateInterval = Math.floor(watchDuration / 80);
        
        progressBar.update(20, { status: `Watching video for ${Math.floor(watchDuration/60)} minutes...` });
        
        for (let i = 0; i < watchDuration; i += updateInterval) {
            await sleep(updateInterval * 1000);
            const progress = 20 + Math.min(80, Math.floor((i / watchDuration) * 80));
            progressBar.update(progress, { 
                status: `Watching: ${Math.floor((i/watchDuration) * 100)}% complete` 
            });
        }
        
        progressBar.update(100, { status: 'Complete!' });
        progressBar.stop();
        return true;
    } catch (error) {
        progressBar.stop();
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
    
    console.log(chalk.yellow('\nInitializing...'));
    const fetchingBar = multibar.create(100, 0, { status: 'Fetching proxies...' });
    let proxies = await fetchProxies();
    fetchingBar.update(100, { status: 'Proxies fetched!' });
    fetchingBar.stop();
    
    if (proxies.length === 0) {
        console.error(chalk.red('No proxies available. Exiting...'));
        return;
    }

    console.log(chalk.green(`\nFetched ${proxies.length} proxies. Will verify them as needed.`));
    
    const viewProgressBar = multibar.create(viewCount, 0, { status: 'Starting views...' });
    let successfulViews = 0;
    let currentProxyIndex = 0;
    let verifiedCount = 0;

    while (successfulViews < viewCount) {
        // Verify more proxies if needed
        if (verifiedCount < Math.min(viewCount * 2, proxies.length) && 
            currentProxyIndex + CONFIG.PROXY_VERIFICATION_BATCH_SIZE <= proxies.length) {
            const newVerified = await verifyNextProxies(proxies, currentProxyIndex, viewCount * 2);
            verifiedCount += newVerified;
        }

        const proxy = proxies[currentProxyIndex];
        console.log(chalk.blue(`\nAttempt ${successfulViews + 1}/${viewCount} using proxy: ${proxy.protocol}://${proxy.host}:${proxy.port}`));
        
        const success = await watchVideo(videoUrl, proxy);
        
        if (success) {
            successfulViews++;
            viewProgressBar.increment(1, { status: `${successfulViews}/${viewCount} views complete` });
        } else {
            console.log(chalk.red('✗ View failed, trying next proxy...'));
        }

        // Move to next proxy
        currentProxyIndex = (currentProxyIndex + 1) % proxies.length;
        
        // If we've gone through all proxies, fetch new ones
        if (currentProxyIndex === 0) {
            console.log(chalk.yellow('\nRefreshing proxy list...'));
            proxies = await fetchProxies();
            verifiedCount = 0;
        }

        // Wait between views
        if (successfulViews < viewCount) {
            const delayBar = multibar.create(CONFIG.DELAY_BETWEEN_VIEWS, 0, { status: 'Waiting before next view...' });
            for (let i = 0; i < CONFIG.DELAY_BETWEEN_VIEWS; i++) {
                await sleep(1000);
                delayBar.increment(1, { status: `Waiting: ${CONFIG.DELAY_BETWEEN_VIEWS - i - 1}s remaining` });
            }
            delayBar.stop();
        }
    }

    viewProgressBar.stop();
    multibar.stop();
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
