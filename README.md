# Automated Video Watcher

A Node.js script that automates video watching with proxy rotation to simulate real user behavior.

## Features

- Automated video watching with configurable duration
- Proxy rotation to avoid detection
- Human-like behavior simulation (scrolling, mouse movements, etc.)
- Support for multiple video URLs
- Proxy management with automatic testing and fallback
- Integration with multiple proxy APIs (ProxyScrape and GeoNode)
- Detailed logging

## Requirements

- Node.js 14+
- NPM or Yarn

## Installation

1. Clone the repository or download the source code
2. Navigate to the project directory
3. Install dependencies:

```bash
npm install
```

## Configuration

The script can be configured by modifying the CONFIG object in `index.js`:

- `USE_PROXY_API`: Whether to use proxy APIs for fetching proxies (default: true)
- `PROXY_FILE`: Fallback file for proxies (default: 'http_proxies.txt')
- `MIN_WATCH_DURATION`: Minimum watch duration in seconds (default: 180 seconds / 3 minutes)
- `MAX_WATCH_DURATION`: Maximum watch duration in seconds (default: 300 seconds / 5 minutes)
- `VIEWS_PER_PROXY`: Number of views per proxy (default: 3)
- `DELAY_BETWEEN_VIEWS`: Delay between views in seconds (default: 10 seconds)
- `MAX_PROXY_FAILURES`: Maximum failures before a proxy is discarded (default: 3)
- `SAVE_WORKING_PROXIES`: Whether to save working proxies to file (default: true)

## Usage

Run the script with:

```bash
npm start
```

or

```bash
node index.js
```

The script will:

1. Prompt you for a video URL to watch
2. Ask how many views you want to generate
3. Fetch proxies from multiple proxy APIs (if enabled)
4. Fall back to loading proxies from a file if APIs fail
5. Ask for manual proxy input if no proxies are available
6. Generate the requested number of views using the available proxies
7. Save working proxies to a file (if enabled)

## Proxy Sources

The script can use proxies from multiple sources:

1. **Proxy APIs**: Automatically fetches free proxies from:
   - ProxyScrape API
   - GeoNode API
2. **Local file**: Loads proxies from a text file (default: 'http_proxies.txt')
3. **Manual input**: Allows you to enter proxies manually if no other sources are available

## Customizing Watch Behavior

The script simulates human-like behavior while watching videos:

- Random scrolling
- Mouse movements
- Volume adjustments (for YouTube)
- Fullscreen toggling (for YouTube)
- Periodic activity for longer videos

You can customize these behaviors by modifying the `VideoPlayer` class in `videoPlayer.js`.

## Troubleshooting

If you encounter issues:

1. Make sure all dependencies are installed
2. Check that your proxies are working
3. Verify that the video URL is accessible
4. Increase the watch duration if videos are not being viewed properly

## License

MIT

## Disclaimer

This tool is for educational purposes only. Use responsibly and in accordance with the terms of service of the websites you visit. 