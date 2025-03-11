const axios = require('axios');
const inquirer = require('inquirer');
const chalk = require('chalk');
const { sleep } = require('./utils');

// Configuration
const CONFIG = {
    MIN_WATCH_DURATION: 1140, // 19 minutes
    MAX_WATCH_DURATION: 1260, // 21 minutes
    DELAY_BETWEEN_VIEWS: 10,  // 10 seconds
    MAX_RETRIES: 3
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
    try {
        console.log(chalk.blue('Fetching proxies from GeoNode API...'));
        const response = await axios.get('https://proxylist.geonode.com/api/proxy-list?limit=100&page=1&sort_by=lastChecked&sort_type=desc&protocols=http%2Chttps&anonymityLevel=elite&anonymityLevel=anonymous');
        
        if (response.data && response.data.data) {
            const proxies = response.data.data.map(p => `${p.protocol}://${p.ip}:${p.port}`);
            console.log(chalk.green(`Successfully fetched ${proxies.length} proxies`));
            return proxies;
        }
    } catch (error) {
        console.error(chalk.red('Error fetching proxies:', error.message));
    }
    
    // Fallback to free proxies
    try {
        console.log(chalk.blue('Fetching from alternative proxy source...'));
        const response = await axios.get('https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=10000&country=all&ssl=all&anonymity=all');
        const proxies = response.data.split('\n').filter(Boolean).map(proxy => `http://${proxy.trim()}`);
        console.log(chalk.green(`Successfully fetched ${proxies.length} proxies`));
        return proxies;
    } catch (error) {
        console.error(chalk.red('Error fetching alternative proxies:', error.message));
        return [];
    }
}

async function watchVideo(url, proxy) {
    const axiosConfig = {
        proxy: {
            host: proxy.split('://')[1].split(':')[0],
            port: parseInt(proxy.split(':').pop()),
            protocol: proxy.split('://')[0]
        },
        timeout: 30000,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
    };

    try {
        await axios.get(url, axiosConfig);
        const watchDuration = Math.floor(Math.random() * (CONFIG.MAX_WATCH_DURATION - CONFIG.MIN_WATCH_DURATION + 1)) + CONFIG.MIN_WATCH_DURATION;
        console.log(chalk.blue(`Watching video for ${watchDuration} seconds...`));
        await sleep(watchDuration * 1000);
        return true;
    } catch (error) {
        console.error(chalk.red(`Error with proxy ${proxy}:`, error.message));
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

    console.log(chalk.green(`Starting to generate ${viewCount} views...`));
    
    let successfulViews = 0;
    let currentProxyIndex = 0;

    while (successfulViews < viewCount) {
        const proxy = proxies[currentProxyIndex];
        console.log(chalk.blue(`\nAttempt ${successfulViews + 1}/${viewCount} using proxy: ${proxy}`));
        
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
                proxies = newProxies;
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
