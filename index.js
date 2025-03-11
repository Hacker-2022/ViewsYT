const axios = require('axios');
const inquirer = require('inquirer');
const chalk = require('chalk');
const cliProgress = require('cli-progress');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { HttpProxyAgent } = require('http-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');
const fs = require('fs');
const path = require('path');

// Sleep function
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Configuration
const CONFIG = {
    // Reduced watch duration for faster testing
    MIN_WATCH_DURATION: 30, // 30 seconds
    MAX_WATCH_DURATION: 60, // 60 seconds
    DELAY_BETWEEN_VIEWS: 5,  // 5 seconds
    MAX_RETRIES: 3,
    SUPPORTED_PROTOCOLS: ['http', 'https', 'socks4', 'socks5'],
    CONNECTION_TIMEOUT: 3000,  // 3 seconds timeout for connections
    MAX_PROXIES_TO_TRY: 100,   // Maximum number of proxies to try before refreshing the list
    QUICK_CHECK_TIMEOUT: 1000,  // 1 second for quick check
    SAVE_WORKING_PROXIES: true, // Save working proxies to file
    WORKING_PROXIES_FILE: 'working_proxies.json',
    USER_AGENTS: [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.107 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:90.0) Gecko/20100101 Firefox/90.0'
    ]
};

// Progress bars
const multibar = new cliProgress.MultiBar({
    clearOnComplete: false,
    hideCursor: true,
    format: '{bar} {percentage}% | {value}/{total} | {status}'
}, cliProgress.Presets.shades_grey);

// Load working proxies from file if exists
function loadWorkingProxies() {
    try {
        if (fs.existsSync(CONFIG.WORKING_PROXIES_FILE)) {
            const data = fs.readFileSync(CONFIG.WORKING_PROXIES_FILE, 'utf8');
            const proxies = JSON.parse(data);
            console.log(chalk.green(`Loaded ${proxies.length} working proxies from file`));
            return proxies;
        }
    } catch (error) {
        console.error(chalk.yellow(`Error loading working proxies: ${error.message}`));
    }
    return [];
}

// Save working proxies to file
function saveWorkingProxies(proxies) {
    try {
        fs.writeFileSync(CONFIG.WORKING_PROXIES_FILE, JSON.stringify(proxies, null, 2));
        console.log(chalk.green(`Saved ${proxies.length} working proxies to file`));
    } catch (error) {
        console.error(chalk.yellow(`Error saving working proxies: ${error.message}`));
    }
}

// Get random user agent
function getRandomUserAgent() {
    return CONFIG.USER_AGENTS[Math.floor(Math.random() * CONFIG.USER_AGENTS.length)];
}

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
    const workingProxies = loadWorkingProxies();
    
    if (workingProxies.length > 0) {
        allProxies.push(...workingProxies);
    }

    // GeoNode API
    try {
        console.log(chalk.blue('Fetching proxies from GeoNode API...'));
        const response = await axios.get('https://proxylist.geonode.com/api/proxy-list?limit=100&page=1&sort_by=lastChecked&sort_type=desc&filterUpTime=90&protocols=http%2Chttps%2Csocks4%2Csocks5&anonymityLevel=elite&anonymityLevel=anonymous', {
            timeout: 10000
        });
        
        if (response.data && response.data.data) {
            const proxies = response.data.data.map(p => {
                const protocols = Array.isArray(p.protocols) ? p.protocols : [p.protocol];
                return protocols.map(protocol => ({
                    protocol: protocol.toLowerCase(),
                    host: p.ip,
                    port: p.port,
                    country: p.country,
                    anonymity: p.anonymityLevel,
                    working: false,
                    lastChecked: Date.now()
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
            const response = await axios.get(`https://api.proxyscrape.com/v2/?request=displayproxies&protocol=${protocol}&timeout=10000&country=all&ssl=all&anonymity=all`, {
                timeout: 10000
            });
            
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
                    working: false,
                    lastChecked: Date.now()
                }));

            allProxies.push(...proxies);
            console.log(chalk.green(`Successfully fetched ${proxies.length} ${protocol} proxies from ProxyScrape`));
        }
    } catch (error) {
        console.error(chalk.red('Error fetching from ProxyScrape:', error.message));
    }

    // Free-proxy-list.net (additional source from Python code)
    try {
        console.log(chalk.blue('Fetching proxies from free-proxy-list.net...'));
        const response = await axios.get('https://free-proxy-list.net/', {
            timeout: 10000
        });
        
        // Extract proxies from HTML table
        const html = response.data;
        const regex = /(\d+\.\d+\.\d+\.\d+):(\d+)/g;
        let match;
        const proxies = [];
        
        while ((match = regex.exec(html)) !== null) {
            proxies.push({
                protocol: 'http',
                host: match[1],
                port: parseInt(match[2]),
                country: 'Unknown',
                anonymity: 'Unknown',
                working: false,
                lastChecked: Date.now()
            });
        }
        
        allProxies.push(...proxies);
        console.log(chalk.green(`Successfully fetched ${proxies.length} proxies from free-proxy-list.net`));
    } catch (error) {
        console.error(chalk.red('Error fetching from free-proxy-list.net:', error.message));
    }

    // Remove duplicates
    const uniqueProxies = [];
    const seen = new Set();
    
    for (const proxy of allProxies) {
        const key = `${proxy.protocol}://${proxy.host}:${proxy.port}`;
        if (!seen.has(key)) {
            seen.add(key);
            uniqueProxies.push(proxy);
        }
    }

    // Shuffle the proxies for better distribution
    return uniqueProxies.sort(() => Math.random() - 0.5);
}

function getProxyAgent(proxy) {
    const { protocol, host, port } = proxy;
    const proxyUrl = `${protocol}://${host}:${port}`;
    
    try {
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
    } catch (error) {
        console.error(chalk.red(`Error creating agent for ${proxyUrl}: ${error.message}`));
        return null;
    }
}

// Quick check if a proxy is responsive
async function quickCheckProxy(proxy) {
    return new Promise(resolve => {
        const timeoutId = setTimeout(() => {
            resolve(false);
        }, CONFIG.QUICK_CHECK_TIMEOUT);

        try {
            const agent = getProxyAgent(proxy);
            if (!agent) {
                clearTimeout(timeoutId);
                resolve(false);
                return;
            }

            const axiosConfig = {
                httpsAgent: agent,
                httpAgent: agent,
                timeout: CONFIG.QUICK_CHECK_TIMEOUT - 200,
                validateStatus: () => true, // Accept any status code
                headers: {
                    'User-Agent': getRandomUserAgent()
                }
            };

            axios.head('https://www.google.com', axiosConfig)
                .then(() => {
                    clearTimeout(timeoutId);
                    proxy.working = true;
                    proxy.lastChecked = Date.now();
                    resolve(true);
                })
                .catch(() => {
                    clearTimeout(timeoutId);
                    resolve(false);
                });
        } catch (error) {
            clearTimeout(timeoutId);
            resolve(false);
        }
    });
}

async function watchVideo(url, proxy, workingProxies) {
    const progressBar = multibar.create(100, 0, { status: 'Starting view...' });
    
    try {
        // Quick check first
        progressBar.update(10, { status: 'Quick checking proxy...' });
        const isResponsive = await quickCheckProxy(proxy);
        if (!isResponsive) {
            progressBar.stop();
            return false;
        }

        const agent = getProxyAgent(proxy);
        if (!agent) {
            progressBar.stop();
            return false;
        }

        // Extract video ID for referrer
        const videoId = url.includes('watch?v=') 
            ? url.split('watch?v=')[1].split('&')[0]
            : url.split('youtu.be/')[1].split('?')[0];
            
        const referrers = [
            'https://www.google.com/search?q=' + encodeURIComponent(`${videoId} youtube`),
            'https://www.facebook.com/',
            'https://www.reddit.com/',
            'https://www.bing.com/search?q=' + encodeURIComponent(`youtube ${videoId}`),
            'https://t.co/',
            'https://www.youtube.com/results?search_query=' + encodeURIComponent(videoId)
        ];
        
        const randomReferrer = referrers[Math.floor(Math.random() * referrers.length)];

        const axiosConfig = {
            httpsAgent: agent,
            httpAgent: agent,
            timeout: CONFIG.CONNECTION_TIMEOUT,
            headers: {
                'User-Agent': getRandomUserAgent(),
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Referer': randomReferrer,
                'Cache-Control': 'max-age=0'
            }
        };

        progressBar.update(20, { status: 'Accessing video...' });
        
        // Try to access the video with retries
        let success = false;
        for (let attempt = 0; attempt < CONFIG.MAX_RETRIES && !success; attempt++) {
            try {
                await axios.get(url, axiosConfig);
                success = true;
            } catch (error) {
                if (attempt === CONFIG.MAX_RETRIES - 1) throw error;
                await sleep(1000); // Wait a bit before retrying
            }
        }
        
        if (!success) {
            throw new Error('Failed to access video after retries');
        }
        
        const watchDuration = Math.floor(Math.random() * (CONFIG.MAX_WATCH_DURATION - CONFIG.MIN_WATCH_DURATION + 1)) + CONFIG.MIN_WATCH_DURATION;
        const updateInterval = Math.max(1, Math.floor(watchDuration / 10));
        
        progressBar.update(20, { status: `Watching video for ${watchDuration} seconds...` });
        
        for (let i = 0; i < watchDuration; i += updateInterval) {
            await sleep(updateInterval * 1000);
            const progress = 20 + Math.min(80, Math.floor((i / watchDuration) * 80));
            progressBar.update(progress, { 
                status: `Watching: ${Math.floor((i/watchDuration) * 100)}% complete` 
            });
        }
        
        progressBar.update(100, { status: 'Complete!' });
        progressBar.stop();
        
        // Add to working proxies list
        if (!workingProxies.some(p => p.host === proxy.host && p.port === proxy.port && p.protocol === proxy.protocol)) {
            proxy.working = true;
            proxy.lastChecked = Date.now();
            workingProxies.push(proxy);
            
            // Save working proxies periodically
            if (CONFIG.SAVE_WORKING_PROXIES) {
                saveWorkingProxies(workingProxies);
            }
        }
        
        return true;
    } catch (error) {
        progressBar.stop();
        if (error.code === 'ECONNREFUSED') {
            console.error(chalk.red(`Connection refused by proxy ${proxy.protocol}://${proxy.host}:${proxy.port}`));
        } else if (error.code === 'ETIMEDOUT' || error.code === 'ESOCKETTIMEDOUT') {
            console.error(chalk.red(`Connection timed out for proxy ${proxy.protocol}://${proxy.host}:${proxy.port}`));
        } else if (error.code === 'ECONNRESET') {
            console.error(chalk.red(`Connection reset by proxy ${proxy.protocol}://${proxy.host}:${proxy.port}`));
        } else if (error.code === 'EHOSTUNREACH') {
            console.error(chalk.red(`Host unreachable for proxy ${proxy.protocol}://${proxy.host}:${proxy.port}`));
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
    let consecutiveFailures = 0;
    let workingProxies = [];

    while (successfulViews < viewCount) {
        // If too many consecutive failures, refresh proxy list
        if (consecutiveFailures >= 20) {
            console.log(chalk.yellow('\nToo many consecutive failures. Refreshing proxy list...'));
            proxies = await fetchProxies();
            currentProxyIndex = 0;
            triedProxies = 0;
            consecutiveFailures = 0;
            continue;
        }

        const proxy = proxies[currentProxyIndex];
        console.log(chalk.blue(`\nAttempt ${successfulViews + 1}/${viewCount} using proxy: ${proxy.protocol}://${proxy.host}:${proxy.port}`));
        
        const success = await watchVideo(videoUrl, proxy, workingProxies);
        
        if (success) {
            successfulViews++;
            viewProgressBar.increment(1, { status: `${successfulViews}/${viewCount} views complete` });
            consecutiveFailures = 0; // Reset consecutive failures counter
        } else {
            console.log(chalk.red('✗ View failed, trying next proxy...'));
            consecutiveFailures++;
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
            consecutiveFailures = 0;
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
    
    // Save final list of working proxies
    if (CONFIG.SAVE_WORKING_PROXIES && workingProxies.length > 0) {
        saveWorkingProxies(workingProxies);
    }
}

// Run the main function
main().catch(error => {
    console.error(chalk.red('An error occurred:', error));
});
