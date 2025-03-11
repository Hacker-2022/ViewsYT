### **Technical Requirements**  
1. **Proxy Rotation**: Avoid IP bans by routing requests through multiple proxies.  
2. **Background Execution**: Run 24/7 without manual intervention.  
3. **User Interaction**: Friendly CLI prompts for URLs/proxies.  
4. **Video Playback Simulation**: Mimic real video watching behavior.  
5. **Lightweight & Free**: Use minimal dependencies and free GitHub tools.  

---

### **Tools & Libraries**  
| Tool                | Purpose                          | Source/GitHub Link                      |  
|---------------------|----------------------------------|-----------------------------------------|  
| `requests`          | HTTP requests with proxy support | Built-in Python library                 |  
| `aiohttp`           | Async HTTP for concurrency       | https://github.com/aio-libs/aiohttp     |  
| `colorama`          | Friendly CLI prompts             | https://github.com/tartley/colorama     |  
| `psutil`            | Process management               | https://github.com/giampaolo/psutil     |  
| `schedule`          | Task scheduling                  | https://github.com/dbader/schedule      |  
| `yaspin`            | CLI spinner for loading          | https://github.com/pavdmyt/yaspin       |  



### **Optimizations**  
- **Lightweight**: Avoid headless browsers; use async HTTP requests.  
- **Error Handling**: Auto-skip failed proxies/URLs and retry.  
- **Logging**: Log activity to a file for debugging.  


**Developer Notes**:  
- Test with free proxies from https://free-proxy-list.net.  
- Adjust sleep timers to match video lengths.  
- Add `User-Agent` rotation for enhanced anonymity.  


# Detailed Project Report: Automated Video-Watching Script with Proxy Rotation

## 1. Overview

This project involves building an automated script that “watches” videos in the background by loading video URLs, cycling through multiple proxies, and looping playback indefinitely. The script will support up to three videos, interact with the user to accept URLs, and utilize free/open-source tools from GitHub to keep the solution lightweight. Additionally, a mechanism to keep the script alive (even when not manually started) will be implemented.

---

## 2. Objectives & Requirements

- **Automated Video Playback:**  
  The script should be able to load a video URL in a headless browser and simulate watching the video for a defined period.

- **Proxy Rotation:**  
  Use multiple proxies to mask the source IP address, making it difficult for target websites to detect automated activity.

- **User Interaction:**  
  Prompt the user in a friendly manner for up to three video URLs during initialization.

- **Looping Playback:**  
  Once provided, the videos should play on a continuous loop. A short delay between loops can simulate natural behavior.

- **Persistent/Always-On Operation:**  
  The script should be deployable as a background service (using system tools like systemd on Linux or Supervisor on Windows) so that it automatically restarts or remains active even when no user is logged in.

- **Lightweight & Free:**  
  Leverage open-source tools (e.g., Selenium, ProxyBroker) available on GitHub and avoid heavy dependencies.

---

## 3. Architecture Overview

### **Modules/Components:**

1. **User Interaction Module:**  
   - Uses simple CLI prompts (e.g., `input()`) to ask for up to three video URLs.
   - Validates the input and stores the URLs.

2. **Video Playback Module:**  
   - Uses a headless browser (via Selenium WebDriver) to load video pages.
   - Mimics real user behavior by waiting (simulating watch time) before closing or looping.

3. **Proxy Management Module:**  
   - Loads a list of proxies (provided by the user or dynamically fetched from a free GitHub tool like [ProxyBroker](https://github.com/constverum/ProxyBroker)).
   - Randomly selects a proxy for each playback session to rotate the outgoing IP address.

4. **Looping & Scheduling:**  
   - Iterates through the list of URLs, using different proxies each time.
   - Implements delays between video playbacks to simulate natural behavior.
   - Wraps the playback logic in an infinite loop.

5. **Persistence/Keep-Alive Mechanism:**  
   - The script itself can run in an endless loop.
   - For true persistence, deploy the script as a service using system tools (e.g., systemd, Supervisor, or a lightweight container).
   - Alternatively, use a task scheduler or a watchdog process that monitors and restarts the script if it fails.

---

## 4. Technology Stack

- **Programming Language:** Python  
- **Automation Tool:** Selenium WebDriver (headless mode for background operation)  
- **Proxy Management:**  
  - Hardcoded list of proxies (for simplicity) or  
  - [ProxyBroker](https://github.com/constverum/ProxyBroker) for fetching free proxies dynamically  
- **Deployment & Persistence:**  
  - For Linux: systemd or cron (with `nohup` or `tmux/screen`)  
  - For Windows: Task Scheduler or Supervisor-like tools

---

## 5. Implementation Details

### **A. User Interaction**

- **Interactive CLI:**  
  The script starts by greeting the user and prompting for video URLs. The user can enter up to three URLs (leaving any blank if fewer are needed).  
  *Example Code Snippet:*
  ```python
  def get_video_urls():
      print("Hello! Please enter up to 3 video URLs (press Enter to skip):")
      urls = []
      for i in range(1, 4):
          url = input(f"Enter URL {i}: ").strip()
          if url:
              urls.append(url)
      if not urls:
          print("No URLs provided. Exiting the script.")
          exit(0)
      return urls

  video_urls = get_video_urls()
  ```

### **B. Video Playback with Selenium**

- **Headless Browser Setup:**  
  Using Selenium’s headless Chrome to simulate video watching without a visible UI.
  
- **Simulating Watch Time:**  
  The script waits for a random duration (e.g., between 60 to 180 seconds) to mimic real user behavior.
  
- **Proxy Injection:**  
  Each Selenium instance is started with a randomly selected proxy from a pre-defined list.
  
  *Example Code Snippet:*
  ```python
  from selenium import webdriver
  from selenium.webdriver.chrome.options import Options
  import time, random

  proxy_list = [
      "http://username:password@proxy1:port",
      "http://username:password@proxy2:port",
      "http://username:password@proxy3:port"
  ]

  def get_random_proxy():
      return random.choice(proxy_list)

  def watch_video(url, proxy):
      options = Options()
      options.add_argument("--headless")
      options.add_argument("--mute-audio")
      options.add_argument(f"--proxy-server={proxy}")
      options.add_argument("--disable-infobars")
      options.add_argument("--start-maximized")

      driver = webdriver.Chrome(options=options)
      try:
          print(f"Watching video: {url} using proxy: {proxy}")
          driver.get(url)
          watch_duration = random.randint(60, 180)
          time.sleep(watch_duration)
      except Exception as e:
          print(f"Error: {e}")
      finally:
          driver.quit()
  ```

### **C. Looping & Scheduling**

- **Infinite Loop:**  
  The script loops over the list of video URLs, applying a random proxy for each playback session.  
- **Delay Between Loops:**  
  A short pause is added between cycles to mimic natural delays.

  *Example Code Snippet:*
  ```python
  while True:
      for url in video_urls:
          proxy = get_random_proxy()
          watch_video(url, proxy)
      print("Restarting loop...")
      time.sleep(10)  # Pause before starting the next cycle
  ```

### **D. Persistence/Keep-Alive**

- **Systemd (Linux):**  
  Create a systemd service file that ensures the script restarts on failure or boot.  
  *Example systemd Unit File (e.g., `/etc/systemd/system/video_watcher.service`):*
  ```ini
  [Unit]
  Description=Automated Video Watcher Service
  After=network.target

  [Service]
  ExecStart=/usr/bin/python3 /path/to/your_script.py
  Restart=always
  User=your_username
  Environment=PYTHONUNBUFFERED=1

  [Install]
  WantedBy=multi-user.target
  ```
- **Task Scheduler/Other Methods:**  
  For Windows, Task Scheduler or third-party process monitors (like NSSM) can achieve similar persistence.

### **E. Free Tools from GitHub**

- **Selenium WebDriver:**  
  Open-source and widely used for browser automation ([GitHub Repository](https://github.com/SeleniumHQ/selenium)).  
- **ProxyBroker (Optional):**  
  If dynamic proxy acquisition is desired, [ProxyBroker](https://github.com/constverum/ProxyBroker) is a lightweight tool to fetch free proxies.
- **Lightweight Deployment Tools:**  
  Using systemd (Linux) or lightweight schedulers ensures the script runs with minimal resource overhead.

---
Conclusion

This report outlines a detailed plan for developing a lightweight, automated video-watching script with proxy rotation and persistent operation. The solution leverages free, open-source tools from GitHub, including Selenium for browser automation and optional tools like ProxyBroker for dynamic proxy management. By combining interactive CLI elements with a robust looping mechanism and deploying via system services, this solution meets the requirements for automated, always-on video watching while keeping resource usage minimal.
