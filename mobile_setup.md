# AeroShare - Mobile Server Setup Guide

This guide explains how to host the AeroShare server backend directly on a mobile device (Android or iOS) instead of a PC. This allows other devices (PCs, tablets, and phones) to connect to your mobile device and exchange files.

---

## 1. Hosting on Android (via Termux)

Termux is a free, open-source terminal emulator that provides a local Linux environment on Android.

### Prerequisites
1. Download and install **Termux** from [F-Droid](https://f-droid.org/packages/com.termux/) or their [Official GitHub Releases](https://github.com/termux/termux-app/releases).
   *(Do not install the Google Play Store version, as it is deprecated and no longer receives package updates).*

### Steps
1. **Initialize Termux Packages**:
   Open Termux and run the updates:
   ```bash
   pkg update && pkg upgrade -y
   ```
2. **Install Python**:
   Run the following command to install Python 3:
   ```bash
   pkg install python -y
   ```
3. **Transfer AeroShare Files**:
   * Zip the `server.py` and the `web` folder.
   * Send the zip to your phone (via USB, email, or a messaging app) and extract it to your phone's storage.
   * Enable storage permission in Termux:
     ```bash
     termux-setup-storage
     ```
   * Move the files into the Termux home directory:
     ```bash
     cp -r /sdcard/Download/airdrop-local ~/
     cd ~/airdrop-local
     ```
4. **Start the Server**:
   Run the Python script:
   ```bash
   python server.py
   ```
5. **Connect**:
   The terminal will output the connection URL (e.g., `http://192.168.x.y:8080`). Open this link in the browser of any other device connected to the same Wi-Fi network to start sharing!

---

## 2. Hosting on iOS / iPhone (via a-Shell)

a-Shell is a free terminal emulator for iOS that includes a built-in Python interpreter.

### Prerequisites
1. Install **a-Shell** or **a-Shell Mini** from the [Apple App Store](https://apps.apple.com/us/app/a-shell/id1473802875).

### Steps
1. **Transfer AeroShare Files**:
   * Save the `server.py` file and the `web` folder onto your iPhone's local storage.
   * In the iOS **Files** app, relocate these files into the local **a-Shell** folder (under the "On My iPhone" section).
2. **Launch a-Shell**:
   Open the a-Shell app on your iPhone.
3. **Verify Directory**:
   Run `ls` to ensure `server.py` and the `web` folder are listed. If not, navigate to the folder using:
   ```bash
   cd Documents
   ```
4. **Start the Server**:
   Launch the script using the iOS Python shell command:
   ```bash
   python3 server.py
   ```
5. **Connect**:
   The terminal will print your iPhone's active local IP address. Navigate to this address on your PC or other phones to start transferring!
