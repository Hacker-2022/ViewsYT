const axios = require('axios');
const { fetchProxiesFromAPI, testProxy } = require('./utils');

/**
 * Manages proxy rotation and selection
 */
class ProxyManager {
    /**
     * Creates a new ProxyManager instance
     * @param {string[]} userProxies Optional list of user-provided proxies
     */
    constructor(userProxies = []) {
        this.proxies = userProxies || [];
        this.currentIndex = 0;
        this.proxyFailures = new Map();
        this.workingProxies = new Set();
        this.maxFailures = 3;
        console.log(`🔄 ProxyManager created with ${this.proxies.length} initial proxies`);
    }

    /**
     * Initialize the proxy manager
     * @returns {Promise<boolean>} - True if initialization was successful
     */
    async initialize() {
        console.log(`Initializing proxy manager with ${this.proxies.length} proxies...`);
        
        // Add initial proxies to working set
        this.proxies.forEach(proxy => {
            this.workingProxies.add(proxy);
            this.proxyFailures.set(proxy, 0);
        });
        
        return this.proxies.length > 0;
    }

    /**
     * Fetch proxies from API and add working ones
     * @returns {Promise<number>} - Number of working proxies added
     */
    async fetchProxiesFromAPI() {
        console.log('Fetching additional proxies from API...');
        
        const apiProxies = await fetchProxiesFromAPI();
        let addedCount = 0;
        
        if (apiProxies.length > 0) {
            console.log(`Testing ${apiProxies.length} proxies from API...`);
            
            // Test a subset of proxies (max 20) to save time
            const testLimit = Math.min(apiProxies.length, 20);
            const proxiesToTest = apiProxies.slice(0, testLimit);
            
            for (const proxy of proxiesToTest) {
                if (await this.testAndAddProxy(proxy)) {
                    addedCount++;
                    
                    // If we have enough working proxies, stop testing
                    if (this.proxies.length >= 10) {
                        console.log('Found enough working proxies, stopping tests');
                        break;
                    }
                }
            }
        }
        
        console.log(`Added ${addedCount} working proxies from API`);
        return addedCount;
    }

    /**
     * Get the next proxy in the rotation
     * @returns {string|null} - Proxy string or null if none available
     */
    getNextProxy() {
        if (this.proxies.length === 0) return null;
        
        // Find a proxy with fewer than maxFailures failures
        let attempts = 0;
        const maxAttempts = this.proxies.length;
        
        while (attempts < maxAttempts) {
            const proxy = this.proxies[this.currentIndex];
            this.currentIndex = (this.currentIndex + 1) % this.proxies.length;
            
            const failures = this.proxyFailures.get(proxy) || 0;
            if (failures < this.maxFailures) {
                return proxy;
            }
            
            attempts++;
        }
        
        // If all proxies have too many failures, reset failures and try again
        console.log('All proxies have too many failures, resetting failure counts');
        this.proxyFailures.clear();
        this.workingProxies.clear();
        this.proxies.forEach(proxy => {
            this.workingProxies.add(proxy);
            this.proxyFailures.set(proxy, 0);
        });
        
        return this.proxies.length > 0 ? this.proxies[0] : null;
    }

    /**
     * Get a random proxy
     * @returns {string|null} - Random proxy string or null if none available
     */
    getRandomProxy() {
        if (this.proxies.length === 0) return null;
        
        // Get array of working proxies (fewer than maxFailures failures)
        const workingProxies = this.proxies.filter(proxy => 
            (this.proxyFailures.get(proxy) || 0) < this.maxFailures
        );
        
        if (workingProxies.length === 0) {
            // If no working proxies, reset failures and try again
            this.proxyFailures.clear();
            this.workingProxies.clear();
            this.proxies.forEach(proxy => {
                this.workingProxies.add(proxy);
                this.proxyFailures.set(proxy, 0);
            });
            return this.proxies[Math.floor(Math.random() * this.proxies.length)];
        }
        
        return workingProxies[Math.floor(Math.random() * workingProxies.length)];
    }

    /**
     * Report a proxy failure
     * @param {string} proxy - The proxy that failed
     */
    reportProxyFailure(proxy) {
        const failures = (this.proxyFailures.get(proxy) || 0) + 1;
        this.proxyFailures.set(proxy, failures);
        
        if (failures >= this.maxFailures) {
            console.log(`Proxy ${proxy} has failed ${failures} times, marking as unreliable`);
            this.workingProxies.delete(proxy);
        }
    }

    /**
     * Report a proxy success
     * @param {string} proxy - The proxy that succeeded
     */
    reportProxySuccess(proxy) {
        this.workingProxies.add(proxy);
        this.proxyFailures.set(proxy, 0);
    }

    /**
     * Test a proxy and add it if working
     * @param {string} proxy - Proxy to test
     * @returns {Promise<boolean>} - True if proxy was added
     */
    async testAndAddProxy(proxy) {
        try {
            const isWorking = await testProxy(proxy);
            
            if (isWorking) {
                // Only add if not already in the list
                if (!this.proxies.includes(proxy)) {
                    this.proxies.push(proxy);
                    this.workingProxies.add(proxy);
                    this.proxyFailures.set(proxy, 0);
                }
                return true;
            }
            
            return false;
        } catch (error) {
            console.log(`Error testing proxy ${proxy}: ${error.message}`);
            return false;
        }
    }

    /**
     * Get the total number of proxies
     * @returns {number} - Number of proxies
     */
    getProxyCount() {
        return this.proxies.length;
    }

    /**
     * Get the number of working proxies
     * @returns {number} - Number of working proxies
     */
    getWorkingProxyCount() {
        return this.workingProxies.size;
    }

    /**
     * Get the list of working proxies
     * @returns {string[]} - Array of working proxies
     */
    getWorkingProxies() {
        return Array.from(this.workingProxies);
    }
}

module.exports = ProxyManager; 