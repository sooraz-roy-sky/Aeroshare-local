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

You can host the AeroShare service from either a PC or a Mobile Device.

### Method A: PC Host Setup (PC as Server)
1. **Launch the Server**:
   * **Windows**: Double-click **`Start-AeroShare.bat`**. This launches the server and opens your browser to the local console at `http://localhost:8080`.
   * **macOS / Linux / Terminal**: Navigate to the directory and run:
     ```bash
     python server.py
     ```
2. **Connect Clients**:
   * Open the dashboard on your PC browser (`http://localhost:8080`).
   * Scan the displayed QR Code using your phone's camera, or manually type the URL into any client browser address bar:
     `http://<YOUR_PC_LOCAL_IP>:8080`

### Method B: Mobile Host Setup (Phone as Server)
You can run the server directly on your mobile device, allowing other PCs, phones, or tablets to connect to it.
1. **Android Setup**: Install **Termux** (via F-Droid), install python (`pkg install python`), copy the project files to your device, and run:
   ```bash
   python server.py
   ```
2. **iOS / iPhone Setup**: Install **a-Shell** from the App Store, place the project files in the a-Shell local documents folder, and run:
   ```bash
   python3 server.py
   ```
3. **Connect Clients**:
   * The phone terminal will print your phone's local IP address (e.g. `http://<YOUR_MOBILE_IP>:8080`).
   * Type this URL into the web browser of any PC or device connected to the same Wi-Fi network.
   * *For full configuration details on mobile packages and storage copying, refer to the [mobile_setup.md](mobile_setup.md) guide.*

---

## Security & Best Practices
* **Path Traversal Protection**: File inputs are parsed using `os.path.basename()` and characters like `..`, `/`, and `\` are stripped to prevent read/write leaks outside the shared folder.
* **XSS Mitigation**: File names are safely injected into the DOM using `textContent` to neutralize script injection.
* **Conflict Prevention**: Filename conflicts are automatically handled by appending suffixes (e.g. `file (1).txt`) instead of overwriting existing data.

---

## Developer & Contact

Developed and maintained by:
* **Developer**: **Suraj Kumar**
* **Email**: [iamsooraz@gmail.com](mailto:iamsooraz@gmail.com)
* **GitHub Profile**: [@sooraz-roy-sky](https://github.com/sooraz-roy-sky)
* **Designation**: District Information Office, Purnea (NIC)
* **Project Repository**: [AeroShare-local](https://github.com/sooraz-roy-sky/Aeroshare-local)
