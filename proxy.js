class Proxy {
    constructor(userProxies = []) {
        this.proxies = userProxies || [];
        this.currentIndex = 0;
    }

    async initialize() {
        if (this.proxies.length === 0) {
            this.proxies = ['http://example1.com:8080', 'http://example2.com:8080'];
        }
        return true;
    }

    getNextProxy() {
        if (this.proxies.length === 0) return null;
        const proxy = this.proxies[this.currentIndex];
        this.currentIndex = (this.currentIndex + 1) % this.proxies.length;
        return proxy;
    }

    getRandomProxy() {
        if (this.proxies.length === 0) return null;
        const randomIndex = Math.floor(Math.random() * this.proxies.length);
        return this.proxies[randomIndex];
    }

    getProxyCount() {
        return this.proxies.length;
    }

    getWorkingProxyCount() {
        return this.proxies.length;
    }
}

module.exports = Proxy; 