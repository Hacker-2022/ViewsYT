# Implementation Guide: Automated Video-Watching Script with Proxy Rotation

This guide focuses on the core implementation details of the automated video-watching script with proxy rotation.

## Core Components Overview

The script consists of four main components:

1. **Main Script (`main.py`)**: Orchestrates the entire process
2. **Proxy Manager (`proxy_manager.py`)**: Handles proxy rotation and management
3. **Video Player (`video_player.py`)**: Simulates video watching using Selenium
4. **Utilities (`utils.py`)**: Provides helper functions for user interaction and logging

## Implementation Details

### 1. Proxy Rotation Implementation

The proxy rotation system works by maintaining a list of proxy servers and cycling through them:

```python
# In proxy_manager.py
def get_next_proxy(self) -> str:
    """Get the next proxy in rotation"""
    if not self.proxies:
        return None
        
    proxy = self.proxies[self.current_index]
    self.current_index = (self.current_index + 1) % len(self.proxies)
    return proxy
```

Key implementation details:
- Uses a circular buffer approach with modulo operation (`%`) to cycle through proxies
- Automatically fetches free proxies if none are provided
- Provides methods to add/remove proxies dynamically

### 2. Video Playback Simulation

The video playback simulation uses Selenium WebDriver in headless mode:

```python
# In video_player.py
def watch(self, url, proxy=None):
    options = Options()
    options.add_argument("--headless")
    # ... other options ...
    
    if proxy:
        options.add_argument(f"--proxy-server={proxy}")
    
    # Add random user agent
    options.add_argument(f"user-agent={random.choice(user_agents)}")
    
    driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=options)
    driver.get(url)
    
    # Simulate watching for random duration
    watch_duration = random.randint(self.min_duration, self.max_duration)
    time.sleep(watch_duration)
```

Key implementation details:
- Uses headless Chrome to avoid showing a browser window
- Adds random user agent for better anonymity
- Simulates watching by waiting for a random duration
- Handles errors gracefully with try/except blocks

### 3. Background Execution

The script is designed to run continuously in the background:

```python
# In main.py
try:
    while True:
        for url in video_urls:
            # ... process video ...
        time.sleep(LOOP_DELAY)
except KeyboardInterrupt:
    logger.info("Stopping video watcher (keyboard interrupt)")
```

For persistent background execution:
- On Windows: Use Task Scheduler with a batch file
- On Linux: Use systemd service

### 4. Error Handling and Logging

The script implements robust error handling and logging:

```python
# In utils.py
def setup_logging():
    logger = logging.getLogger("video_watcher")
    logger.setLevel(logging.INFO)
    
    # Add console and file handlers
    ch = logging.StreamHandler()
    fh = logging.FileHandler("video_watcher.log")
    
    # ... configure formatters ...
    
    logger.addHandler(ch)
    logger.addHandler(fh)
    
    return logger
```

Key implementation details:
- Logs to both console and file
- Captures errors and continues execution
- Provides detailed information for debugging

## Implementation Flowchart

```
┌─────────────────┐
│  Start Script   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Get User Input │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Initialize      │
│ Components      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Enter Main Loop │◄────┐
└────────┬────────┘     │
         │              │
         ▼              │
┌─────────────────┐     │
│ For Each URL    │     │
└────────┬────────┘     │
         │              │
         ▼              │
┌─────────────────┐     │
│ Rotate Proxy    │     │
│ (if needed)     │     │
└────────┬────────┘     │
         │              │
         ▼              │
┌─────────────────┐     │
│ Watch Video     │     │
└────────┬────────┘     │
         │              │
         ▼              │
┌─────────────────┐     │
│ Log Results     │     │
└────────┬────────┘     │
         │              │
         ▼              │
┌─────────────────┐     │
│ Delay           │─────┘
└─────────────────┘
```

## Key Technical Considerations

### 1. Proxy Selection

When selecting proxies, consider:
- **Reliability**: Free proxies often have downtime
- **Speed**: Slower proxies may cause timeouts
- **Anonymity**: Some proxies expose your real IP
- **Rotation Frequency**: Change proxies often to avoid detection

Implementation tip:
```python
# Test proxy before using
def test_proxy(proxy):
    try:
        response = requests.get("https://httpbin.org/ip", 
                               proxies={"http": proxy, "https": proxy},
                               timeout=5)
        return response.status_code == 200
    except:
        return False
```

### 2. Browser Fingerprinting Prevention

To avoid browser fingerprinting:
- Rotate user agents
- Disable WebRTC (which can leak real IP)
- Use incognito mode

Implementation tip:
```python
# Add these options to prevent fingerprinting
options.add_argument("--incognito")
options.add_argument("--disable-blink-features=AutomationControlled")
options.add_experimental_option("excludeSwitches", ["enable-automation"])
options.add_experimental_option("useAutomationExtension", False)
```

### 3. Resource Management

To keep the script lightweight:
- Use headless browser mode
- Close browser instances properly
- Implement timeouts for all network operations
- Use async operations for better performance

Implementation tip:
```python
# Set page load timeout
driver.set_page_load_timeout(30)

# Always close driver in finally block
finally:
    if driver:
        driver.quit()
```

### 4. Simulating Human Behavior

To better mimic human behavior:
- Add random delays between actions
- Scroll the page occasionally
- Move the mouse (if not headless)
- Click on random elements occasionally

Implementation tip:
```python
# Simulate scrolling
def simulate_scrolling(driver):
    for _ in range(random.randint(3, 8)):
        driver.execute_script(f"window.scrollBy(0, {random.randint(100, 500)});")
        time.sleep(random.uniform(0.5, 2.0))
```

## Advanced Implementation Options

### 1. Dynamic Proxy Acquisition

Instead of hardcoded proxies, implement dynamic proxy acquisition:

```python
def fetch_free_proxies(self):
    response = requests.get("https://free-proxy-list.net/")
    soup = BeautifulSoup(response.text, 'html.parser')
    
    proxies = []
    for row in soup.find('table', id='proxylisttable').find_all('tr')[1:]:
        tds = row.find_all('td')
        if tds[6].text == 'yes':  # HTTPS proxy
            ip = tds[0].text
            port = tds[1].text
            proxies.append(f"https://{ip}:{port}")
    
    return proxies
```

### 2. Concurrent Video Watching

For better efficiency, implement concurrent video watching:

```python
import concurrent.futures

def watch_videos_concurrently(video_urls, proxy_manager, max_workers=3):
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = []
        for url in video_urls:
            proxy = proxy_manager.get_next_proxy()
            futures.append(executor.submit(watch_video, url, proxy))
        
        for future in concurrent.futures.as_completed(futures):
            try:
                result = future.result()
                print(f"Result: {result}")
            except Exception as e:
                print(f"Error: {e}")
```

### 3. Adaptive Timing

Implement adaptive timing based on video length detection:

```python
def detect_video_length(driver):
    try:
        # For YouTube
        duration_element = driver.find_element(By.CLASS_NAME, "ytp-time-duration")
        duration_text = duration_element.text  # Format: "MM:SS"
        
        # Parse MM:SS format
        minutes, seconds = map(int, duration_text.split(':'))
        total_seconds = minutes * 60 + seconds
        
        # Watch 70-90% of the video
        watch_percentage = random.uniform(0.7, 0.9)
        return int(total_seconds * watch_percentage)
    except:
        # Fallback to default duration
        return random.randint(60, 180)
```

## Security and Ethical Considerations

When implementing this script, consider:

1. **Terms of Service**: Respect the ToS of websites you're accessing
2. **Rate Limiting**: Implement delays to avoid overwhelming servers
3. **Data Privacy**: Don't collect or store any user data from websites
4. **Legal Compliance**: Ensure your use case is legal in your jurisdiction

## Conclusion

This implementation guide provides the core technical details needed to build an automated video-watching script with proxy rotation. By following these implementation patterns and considering the technical aspects outlined, you can create a robust, lightweight solution that meets the requirements specified in the project overview.

Remember to test thoroughly and monitor the script's behavior to ensure it operates as expected without causing issues for the target websites or your system resources. 