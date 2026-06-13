#!/usr/bin/env python3
"""
AeroShare - High-Speed Local Wireless Data Transfer Server
A pure Python multithreaded HTTP server with zero external dependencies.
Supports chunked uploads, resumable HTTP range downloads, and live SSE syncing.
"""

import os
import sys
import re
import json
import uuid
import socket
import queue
import threading
import urllib.request
import mimetypes
from http.server import BaseHTTPRequestHandler, HTTPServer
from socketserver import ThreadingMixIn

# Server Configuration
DEFAULT_PORT = 8080
SHARED_DIR = "shared"
TEMP_DIR = "temp_uploads"
WEB_DIR = "web"

# Thread-safe session managers
active_uploads = {} # upload_id -> UploadSession
active_uploads_lock = threading.Lock()

class UploadSession:
    def __init__(self, filename, total_size):
        self.filename = filename
        self.total_size = total_size
        self.temp_filename = f"{uuid.uuid4().hex}_{filename}.tmp"
        self.temp_filepath = os.path.join(TEMP_DIR, self.temp_filename)
        self.lock = threading.Lock()
        
        # Pre-allocate file space to avoid disk fragmentation
        with open(self.temp_filepath, "wb") as f:
            if total_size > 0:
                f.seek(total_size - 1)
                f.write(b"\0")

    def write_chunk(self, offset, data):
        with self.lock:
            with open(self.temp_filepath, "r+b") as f:
                f.seek(offset)
                f.write(data)

class EventManager:
    def __init__(self):
        self.clients = []
        self.lock = threading.Lock()

    def register(self, client_queue):
        with self.lock:
            self.clients.append(client_queue)
        self.broadcast_client_count()

    def unregister(self, client_queue):
        with self.lock:
            if client_queue in self.clients:
                self.clients.remove(client_queue)
        self.broadcast_client_count()

    def broadcast(self, data_str):
        with self.lock:
            for q in self.clients:
                q.put(data_str)

    def broadcast_client_count(self):
        # The main host browser counts as a client too, count total queues
        count = len(self.clients)
        self.broadcast(json.dumps({"type": "client_count", "count": count}))

event_manager = EventManager()

class AeroShareHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, format, *args):
        # Override to suppress standard HTTP logging to keep console clean for QR/Stats
        pass

    def send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, DELETE")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Max-Age", "86400")

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_cors_headers()
        self.end_headers()

    def do_GET(self):
        # 1. Server-Sent Events Endpoint
        if self.path == "/api/events":
            self.handle_sse()
            return

        # 2. API: Get Files list
        if self.path == "/api/files":
            self.handle_get_files()
            return

        # 3. API: Download File
        if self.path.startswith("/api/download/"):
            self.handle_download_file()
            return

        # 4. Static Asset Serving
        self.handle_static_serving()

    def do_POST(self):
        # 1. API: Start Upload Handshake
        if self.path == "/api/upload/start":
            self.handle_upload_start()
            return

        # 2. API: Chunk Upload Ingestion
        if self.path == "/api/upload/chunk":
            self.handle_upload_chunk()
            return

        # 3. API: Complete Upload Handshake
        if self.path == "/api/upload/complete":
            self.handle_upload_complete()
            return

        self.send_error(404, "Endpoint not found")

    def do_DELETE(self):
        # API: Delete File
        if self.path.startswith("/api/files/"):
            self.handle_delete_file()
            return
        self.send_error(404, "Endpoint not found")

    # ----- SSE Handler -----
    def handle_sse(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.send_cors_headers()
        self.end_headers()

        client_queue = queue.Queue()
        event_manager.register(client_queue)

        # Send initial files list
        initial_files = get_shared_files_list()
        self.wfile.write(f"data: {json.dumps({'type': 'file_list_update', 'files': initial_files})}\n\n".encode("utf-8"))
        self.wfile.flush()

        try:
            while True:
                try:
                    event_data = client_queue.get(timeout=10)
                    self.wfile.write(f"data: {event_data}\n\n".encode("utf-8"))
                    self.wfile.flush()
                except queue.Empty:
                    # Keep-alive Ping comment (prevents connection drop & tests connection integrity)
                    self.wfile.write(b": ping\n\n")
                    self.wfile.flush()
        except (ConnectionError, socket.error):
            # Client closed connection
            pass
        finally:
            event_manager.unregister(client_queue)

    # ----- GET handlers -----
    def handle_get_files(self):
        files_list = get_shared_files_list()
        res_data = json.dumps(files_list).encode("utf-8")
        
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(res_data)))
        self.send_cors_headers()
        self.end_headers()
        self.wfile.write(res_data)

    def handle_download_file(self):
        # Extract and sanitize filename
        raw_name = urllib.parse.unquote(self.path[14:])
        safe_name = os.path.basename(raw_name)
        filepath = os.path.join(SHARED_DIR, safe_name)

        if not os.path.exists(filepath) or os.path.isdir(filepath):
            self.send_error(404, "File not found")
            return

        file_size = os.path.getsize(filepath)
        content_type, _ = mimetypes.guess_type(filepath)
        if not content_type:
            content_type = "application/octet-stream"

        range_header = self.headers.get("Range")
        
        # Supporting Range Requests (206 Partial Content)
        if range_header:
            range_match = re.match(r"bytes=(\d+)-(\d*)", range_header)
            if range_match:
                start = int(range_match.group(1))
                end_str = range_match.group(2)
                end = int(end_str) if end_str else file_size - 1

                # Validation of Range boundaries
                if start >= file_size or end >= file_size or start > end:
                    self.send_response(416, "Requested Range Not Satisfiable")
                    self.send_header("Content-Range", f"bytes */{file_size}")
                    self.end_headers()
                    return

                length = end - start + 1
                self.send_response(206, "Partial Content")
                self.send_header("Content-Range", f"bytes {start}-{end}/{file_size}")
                self.send_header("Content-Length", str(length))
                self.send_header("Content-Type", content_type)
                self.send_header("Accept-Ranges", "bytes")
                self.send_header("Content-Disposition", f'attachment; filename="{safe_name}"')
                self.send_cors_headers()
                self.end_headers()

                # Stream requested block
                try:
                    with open(filepath, "rb") as f:
                        f.seek(start)
                        bytes_left = length
                        while bytes_left > 0:
                            chunk_to_read = min(65536, bytes_left)
                            data = f.read(chunk_to_read)
                            if not data:
                                break
                            self.wfile.write(data)
                            bytes_left -= len(data)
                except (ConnectionError, socket.error):
                    pass
                return

        # Serving full file (200 OK)
        self.send_response(200)
        self.send_header("Content-Length", str(file_size))
        self.send_header("Content-Type", content_type)
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Disposition", f'attachment; filename="{safe_name}"')
        self.send_cors_headers()
        self.end_headers()

        try:
            with open(filepath, "rb") as f:
                while True:
                    data = f.read(65536)
                    if not data:
                        break
                    self.wfile.write(data)
        except (ConnectionError, socket.error):
            pass

    def handle_static_serving(self):
        # Resolve target file path
        url_path = self.path.split("?")[0]
        if url_path == "/":
            url_path = "/index.html"

        # Safe directory lookup
        safe_path = os.path.basename(url_path)
        filepath = os.path.join(WEB_DIR, safe_path)

        if not os.path.exists(filepath) or os.path.isdir(filepath):
            self.send_error(404, "Asset not found")
            return

        file_size = os.path.getsize(filepath)
        content_type, _ = mimetypes.guess_type(filepath)
        if safe_path.endswith(".js"):
            content_type = "application/javascript"
        elif safe_path.endswith(".css"):
            content_type = "text/css"

        self.send_response(200)
        self.send_header("Content-Length", str(file_size))
        self.send_header("Content-Type", content_type or "text/plain")
        self.end_headers()

        with open(filepath, "rb") as f:
            self.wfile.write(f.read())

    # ----- POST handlers -----
    def handle_upload_start(self):
        length = int(self.headers.get("Content-Length", 0))
        post_data = self.rfile.read(length)
        data = json.loads(post_data.decode("utf-8"))

        raw_filename = data.get("filename")
        total_size = int(data.get("size", 0))

        # Path Traversal Protection
        safe_filename = os.path.basename(raw_filename)
        safe_filename = safe_filename.replace("..", "").replace("/", "").replace("\\", "")

        # Create Upload Session
        upload_id = uuid.uuid4().hex
        session = UploadSession(safe_filename, total_size)
        
        with active_uploads_lock:
            active_uploads[upload_id] = session

        res_data = json.dumps({"uploadId": upload_id, "filename": safe_filename}).encode("utf-8")
        
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(res_data)))
        self.send_cors_headers()
        self.end_headers()
        self.wfile.write(res_data)

    def handle_upload_chunk(self):
        upload_id = self.headers.get("X-Upload-Id")
        chunk_index = int(self.headers.get("X-Chunk-Index", 0))
        offset = int(self.headers.get("X-Chunk-Offset", 0))
        chunk_size = int(self.headers.get("X-Chunk-Size", 0))

        # Lookup session safely
        with active_uploads_lock:
            session = active_uploads.get(upload_id)

        if not session:
            self.send_error(400, "Invalid or expired Upload Session ID")
            return

        # Range verification for write boundary
        if offset + chunk_size > session.total_size:
            self.send_error(400, "Chunk offset range overflows allocated file limit")
            return

        # Read binary chunk body
        chunk_data = self.rfile.read(chunk_size)
        
        # Write chunk at precise offset
        session.write_chunk(offset, chunk_data)

        res_data = json.dumps({"status": "ok", "chunk": chunk_index}).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(res_data)))
        self.send_cors_headers()
        self.end_headers()
        self.wfile.write(res_data)

    def handle_upload_complete(self):
        length = int(self.headers.get("Content-Length", 0))
        post_data = self.rfile.read(length)
        data = json.loads(post_data.decode("utf-8"))
        upload_id = data.get("uploadId")

        with active_uploads_lock:
            session = active_uploads.pop(upload_id, None)

        if not session:
            self.send_error(400, "Invalid Upload Session ID")
            return

        # Safe Final Relocation with Collision Prevention
        final_filename = session.filename
        name_part, ext_part = os.path.splitext(final_filename)
        counter = 1
        
        while os.path.exists(os.path.join(SHARED_DIR, final_filename)):
            final_filename = f"{name_part} ({counter}){ext_part}"
            counter += 1

        final_path = os.path.join(SHARED_DIR, final_filename)
        
        try:
            os.rename(session.temp_filepath, final_path)
        except Exception as e:
            self.send_error(500, f"Error finalizing file relocation: {str(e)}")
            return

        # Broadcast File update via SSE
        updated_files = get_shared_files_list()
        event_manager.broadcast(json.dumps({"type": "file_list_update", "files": updated_files}))
        event_manager.broadcast(json.dumps({"type": "toast", "message": f"New file shared: {final_filename}"}))

        res_data = json.dumps({"status": "ok", "filename": final_filename}).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(res_data)))
        self.send_cors_headers()
        self.end_headers()
        self.wfile.write(res_data)

    def handle_delete_file(self):
        raw_name = urllib.parse.unquote(self.path[11:])
        safe_name = os.path.basename(raw_name)
        filepath = os.path.join(SHARED_DIR, safe_name)

        if not os.path.exists(filepath) or os.path.isdir(filepath):
            self.send_error(404, "File not found")
            return

        try:
            os.remove(filepath)
        except Exception as e:
            self.send_error(500, f"Error deleting file: {str(e)}")
            return

        # Notify active clients
        updated_files = get_shared_files_list()
        event_manager.broadcast(json.dumps({"type": "file_list_update", "files": updated_files}))
        
        self.send_response(200)
        self.send_cors_headers()
        self.end_headers()


# ----- Helper Server Functions -----
def get_shared_files_list():
    files = []
    if not os.path.exists(SHARED_DIR):
        return files
        
    for name in os.listdir(SHARED_DIR):
        path = os.path.join(SHARED_DIR, name)
        if os.path.isfile(path):
            files.append({
                "name": name,
                "size": os.path.getsize(path),
                "uploadedAt": os.path.getmtime(path)
            })
    # Sort files by newest uploaded first
    files.sort(key=lambda x: x["uploadedAt"], reverse=True)
    return files

def get_local_ip():
    """Detect local active Wi-Fi/LAN IPv4 interface address"""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # Doesn't need to be reachable, just triggers local IP routing detection
        s.connect(("10.254.254.254", 1))
        ip = s.getsockname()[0]
    except Exception:
        ip = "127.0.0.1"
    finally:
        s.close()
    return ip

def bootstrap_assets():
    """Create project directories and download required offline files"""
    os.makedirs(SHARED_DIR, exist_ok=True)
    os.makedirs(TEMP_DIR, exist_ok=True)
    os.makedirs(WEB_DIR, exist_ok=True)

    # Cleanup incomplete tmp uploads from past launches
    for item in os.listdir(TEMP_DIR):
        if item.endswith(".tmp"):
            try:
                os.remove(os.path.join(TEMP_DIR, item))
            except Exception:
                pass

    # Download qrcode.min.js locally to support offline transfers
    qr_lib_path = os.path.join(WEB_DIR, "qrcode.min.js")
    if not os.path.exists(qr_lib_path):
        print("[Setup] Local qrcode.min.js missing. Bootstrapping asset...")
        url = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"
        try:
            # Short timeout to avoid blocking startup if offline
            with urllib.request.urlopen(url, timeout=3) as response:
                with open(qr_lib_path, "wb") as f:
                    f.write(response.read())
            print("[Setup] Bootstrapping complete! qrcode.min.js saved for offline use.")
        except Exception as e:
            print(f"[Setup] Warning: Could not download QR library ({e}). Serving in text fallback mode.")

class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    """Handle requests in a separate thread."""
    daemon_threads = True

    def handle_error(self, request, client_address):
        # Suppress connection reset and aborted warnings from polluting console
        err_type, err_value, _ = sys.exc_info()
        if err_type in (ConnectionResetError, ConnectionAbortedError, BrokenPipeError):
            return
        super().handle_error(request, client_address)

def print_server_banner(ip, port):
    url = f"http://{ip}:{port}"
    banner = r"""
============================================================
       ___                     _____ _                       
      / _ \                   /  ___| |                      
     / /_\ \ ___ _ __ ___     \ `--.| |__   __ _ _ __ ___    
     |  _  |/ _ \ '__/ _ \     `--. \ '_ \ / _` | '__/ _ \\   
     | | | |  __/ | | (_) |   /\__/ / | | | (_| | | |  __/   
     \_| |_/\___|_|  \___/    \____/\_| |_/\__,_|_|  \___|   
                                                             
     >> Local Wireless High-Speed File Sharer v1.0.0
============================================================
[Server Status] Active and listening for incoming connections.
[Local IP Address] {ip}
[Server Port] {port}

[Connection URL] {url}
------------------------------------------------------------
Open this link on other devices on the same Wi-Fi network:
>> {url}
============================================================
""".format(ip=ip, port=port, url=url)
    print(banner)

def main():
    bootstrap_assets()
    
    local_ip = get_local_ip()
    port = DEFAULT_PORT

    # Attempt to bind to requested port, finding next available if busy
    server = None
    while port < DEFAULT_PORT + 100:
        try:
            server = ThreadedHTTPServer(("0.0.0.0", port), AeroShareHandler)
            break
        except OSError:
            print(f"[Port Alert] Port {port} is occupied. Trying next port...")
            port += 1

    if not server:
        print("[Fatal Error] Could not find any free port in the range 8080-8180.")
        sys.exit(1)

    print_server_banner(local_ip, port)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[Server Shutdown] Stopping server, cleaning active session files...")
        server.server_close()
        sys.exit(0)

if __name__ == "__main__":
    main()
