# AeroShare - High-Speed Local Wireless Data Transfer

AeroShare is a zero-install, cross-platform, high-speed local wireless data transfer tool designed to seamlessly share files bidirectionally across devices (Mobile-to-Mobile, PC-to-PC, PC-to-Mobile, and Mobile-to-PC). 

It operates entirely on your local network (Wi-Fi/LAN) without relying on cloud servers or external internet routing, ensuring maximum speed, privacy, and offline autonomy.

---

## Key Features

1. **High-Performance Ingestion**: Uses a multi-worker concurrent uploading engine in the browser. Large files are segmented into configurable chunks (e.g., 4MB blocks) using the JavaScript `FileReader` API and `Blob.slice()` to prevent browser memory bloat or tab crashes.
2. **Pre-allocated Disk Writing**: The Python backend pre-allocates file buffers on startup using `truncate()` and writes binary chunks directly to precise disk offsets via thread-safe `seek()` operations.
3. **Resumable Streams (HTTP Range)**: Implements native parsing of `Range` headers (`206 Partial Content`) to support pausing/resuming downloads and video scrubbing directly in mobile browsers.
4. **Real-Time Synchronization (SSE)**: Powered by Server-Sent Events (SSE) to push file list changes and connected client counts instantly across all open browser windows.
5. **Autonomy & Zero-Install**: Zero external Python package requirements (built entirely on standard libraries). Dynamically caches the QR code library on first run to support 100% offline local networks.

---

## Project Structure

* `server.py` - Threaded HTTP server hosting the local server and API layers.
* `Start-AeroShare.bat` - Double-click Windows startup script.
* `mobile_setup.md` - Step-by-step instructions for hosting the server natively on Android (Termux) or iOS (a-Shell).
* `test_endpoints.py` - Integration testing suite.
* `web/` - Glassmorphic dark-themed HTML5/CSS/JS frontend dashboard.

---

## How to Run & Connect

### 1. Run the Server
* **Windows**: Open the folder and double-click **`Start-AeroShare.bat`**. This will start the server and automatically launch the local dashboard at `http://localhost:8080`.
* **macOS / Linux / Terminal**: Open a terminal, navigate to the folder, and run:
  ```bash
  python server.py
  ```

### 2. Connect Your Phone
1. Open the dashboard on your PC browser (`http://localhost:8080`).
2. Scan the generated QR code displayed on your monitor using your mobile device's camera.
3. *Alternatively*, type your PC's local network IP and port into your phone's browser address bar:
   `http://<YOUR_PC_LOCAL_IP>:8080`
4. Both devices are now connected. You can drag and drop or select files to transfer them instantly at local Wi-Fi speeds!

---

## Security & Best Practices
* **Path Traversal Protection**: File inputs are parsed using `os.path.basename()` and characters like `..`, `/`, and `\` are stripped to prevent read/write leaks outside the shared folder.
* **XSS Mitigation**: File names are safely injected into the DOM using `textContent` to neutralize script injection.
* **Conflict Prevention**: Filename conflicts are automatically handled by appending suffixes (e.g. `file (1).txt`) instead of overwriting existing data.
