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
    CONNECTION_TIMEOUT: 5000,  // 5 seconds timeout for connections
    MAX_PROXIES_TO_TRY: 100    // Maximum number of proxies to try before refreshing the list
};

// Progress bars
const multibar = new cliProgress.MultiBar({
    clearOnComplete: false,
    hideCursor: true,
    format: '{bar} {percentage}% | {value}/{total} | {status}'
}, cliProgress.Presets.shades_grey);

async function getVideoUrl() {
    const { videoUrl } = await inquirer.prompt([
        {
            type: 'input',
            name: 'videoUrl',
            message: 'Enter YouTube video URL:',
            default: 'https://www.youtube.com/watch?v=NWRQe9tUbAY',
            validate: function(value) {
                const valid = value.includes('youtube.com/watch?v=') || value.includes('youtu.be/');
                return valid || 'Please enter a valid YouTube video URL';
            }
        }
    ]);
    return videoUrl;
}

async function getViewCount() {
    const { viewCount } = await inquirer.prompt([
        {
            type: 'input',
            name: 'viewCount',
            message: 'How many views do you want to generate?',
            default: '2',
            validate: function(value) {
                const valid = !isNaN(parseInt(value)) && parseInt(value) > 0;
                return valid || 'Please enter a valid number';
            },
            filter: Number
        }
    ]);
    return viewCount;
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

    // Shuffle the proxies for better distribution
    return allProxies.sort(() => Math.random() - 0.5);
}

function getProxyAgent(proxy) {
    const { protocol, host, port } = proxy;
    const proxyUrl = `${protocol}://${host}:${port}`;
    
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

async function watchVideo(url, proxy) {
    const progressBar = multibar.create(100, 0, { status: 'Starting view...' });
    
    try {
        const agent = getProxyAgent(proxy);
        const axiosConfig = {
            httpsAgent: agent,
            httpAgent: agent,
            timeout: CONFIG.CONNECTION_TIMEOUT,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1'
            }
        };

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

    console.log(chalk.green(`\nFetched ${proxies.length} proxies. Using them directly without testing.`));
    
    const viewProgressBar = multibar.create(viewCount, 0, { status: 'Starting views...' });
    let successfulViews = 0;
    let currentProxyIndex = 0;
    let triedProxies = 0;

    while (successfulViews < viewCount) {
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
        triedProxies++;
        
        // If we've tried too many proxies, fetch new ones
        if (triedProxies >= CONFIG.MAX_PROXIES_TO_TRY) {
            console.log(chalk.yellow('\nTried too many proxies. Refreshing proxy list...'));
            proxies = await fetchProxies();
            currentProxyIndex = 0;
            triedProxies = 0;
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

// Run the main function
main().catch(error => {
    console.error(chalk.red('An error occurred:', error));
});
