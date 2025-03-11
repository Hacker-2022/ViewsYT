const axios = require('axios');
const { sleep, getRandomInt } = require('./utils');

class VideoPlayer {
    constructor(options = {}) {
        this.minDuration = options.minDuration || 1140; // 19 minutes
        this.maxDuration = options.maxDuration || 1260; // 21 minutes
        this.userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/91.0.864.59 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        ];
    }

    /**
     * Get a random user agent
     * @returns {string} A random user agent string
     */
    getRandomUserAgent() {
        return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
    }

    /**
     * Watch a video using a proxy
     * @param {string} videoUrl - The URL of the video to watch
     * @param {string} proxy - The proxy to use
     * @returns {Promise<boolean>} Whether the watch was successful
     */
    async watch(videoUrl, proxy) {
        try {
            // Configure axios with proxy and user agent
            const axiosConfig = {
                proxy: {
                    host: proxy.split('://')[1].split(':')[0],
                    port: parseInt(proxy.split(':').pop()),
                    protocol: proxy.split('://')[0]
                },
                headers: {
                    'User-Agent': this.getRandomUserAgent(),
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1'
                },
                timeout: 10000 // 10 seconds timeout
            };

            // If proxy has authentication
            if (proxy.includes('@')) {
                const auth = proxy.split('://')[1].split('@')[0];
                axiosConfig.proxy.auth = {
                    username: auth.split(':')[0],
                    password: auth.split(':')[1]
                };
            }

            // First request to get the video page
            console.log(`📡 Accessing video URL: ${videoUrl}`);
            const response = await axios.get(videoUrl, axiosConfig);

            if (response.status !== 200) {
                throw new Error(`Failed to access video. Status: ${response.status}`);
            }

            // Simulate watching the video
            const watchDuration = getRandomInt(this.minDuration, this.maxDuration);
            console.log(`⏱️ Watching video for ${watchDuration} seconds...`);
            await sleep(watchDuration * 1000);

            // Simulate some interactions
            await this.simulateInteractions(videoUrl, axiosConfig);

            return true;
        } catch (error) {
            console.error(`❌ Error watching video: ${error.message}`);
            return false;
        }
    }

    /**
     * Simulate user interactions with the video
     * @param {string} videoUrl - The URL of the video
     * @param {object} axiosConfig - The axios configuration object
     */
    async simulateInteractions(videoUrl, axiosConfig) {
        try {
            // Simulate random scrolling
            const scrollCount = getRandomInt(2, 5);
            for (let i = 0; i < scrollCount; i++) {
                const scrollDelay = getRandomInt(1, 3);
                await sleep(scrollDelay * 1000);
            }

            // Simulate video player interactions (play, pause, etc.)
            const interactionCount = getRandomInt(1, 3);
            for (let i = 0; i < interactionCount; i++) {
                const interactionDelay = getRandomInt(5, 10);
                await sleep(interactionDelay * 1000);
            }
        } catch (error) {
            console.error(`❌ Error during interactions: ${error.message}`);
        }
    }
}

module.exports = VideoPlayer; 