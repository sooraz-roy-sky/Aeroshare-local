#!/usr/bin/env python3
"""
AeroShare - API Verification Script
Tests start handshake, chunk upload, assembly, range downloads, and deletion.
"""

import urllib.request
import urllib.parse
import json
import time

BASE_URL = "http://localhost:8080"

def test_api():
    print("[Test] Starting API test sequence...")

    # 1. Fetch File list (should be empty or contain past files)
    try:
        req = urllib.request.urlopen(f"{BASE_URL}/api/files")
        files = json.loads(req.read().decode())
        print(f"[Test 1: File List] Success. Found {len(files)} files.")
    except Exception as e:
        print(f"[Test 1: File List] FAILED: {e}")
        return

    # 2. Handshake upload start
    filename = "test_verification_file.bin"
    total_size = 12 # 12 bytes
    chunk_size = 4  # 4 bytes per chunk (3 chunks total)
    
    try:
        init_data = json.dumps({
            "filename": filename,
            "size": total_size,
            "chunkSize": chunk_size
        }).encode()
        
        req = urllib.request.Request(
            f"{BASE_URL}/api/upload/start", 
            data=init_data, 
            headers={"Content-Type": "application/json"}
        )
        res = json.loads(urllib.request.urlopen(req).read().decode())
        upload_id = res["uploadId"]
        print(f"[Test 2: Handshake Start] Success. Upload ID: {upload_id}")
    except Exception as e:
        print(f"[Test 2: Handshake Start] FAILED: {e}")
        return

    # 3. Upload 3 chunks in raw binary
    chunks = [b"ABCD", b"EFGH", b"IJKL"]
    try:
        for idx, chunk in enumerate(chunks):
            offset = idx * chunk_size
            req = urllib.request.Request(
                f"{BASE_URL}/api/upload/chunk",
                data=chunk,
                headers={
                    "X-Upload-Id": upload_id,
                    "X-Chunk-Index": str(idx),
                    "X-Chunk-Offset": str(offset),
                    "X-Chunk-Size": str(len(chunk))
                }
            )
            res = json.loads(urllib.request.urlopen(req).read().decode())
            print(f"[Test 3: Chunk {idx}] Uploaded offset {offset} successfully.")
        print("[Test 3: Chunk Uploads] All chunks processed.")
    except Exception as e:
        print(f"[Test 3: Chunk Uploads] FAILED: {e}")
        return

    # 4. Finalize upload
    try:
        complete_data = json.dumps({"uploadId": upload_id}).encode()
        req = urllib.request.Request(
            f"{BASE_URL}/api/upload/complete",
            data=complete_data,
            headers={"Content-Type": "application/json"}
        )
        res = json.loads(urllib.request.urlopen(req).read().decode())
        final_filename = res["filename"]
        print(f"[Test 4: Finalize] Success. Filename: {final_filename}")
    except Exception as e:
        print(f"[Test 4: Finalize] FAILED: {e}")
        return

    # 5. Verify the file exists in download list
    try:
        req = urllib.request.urlopen(f"{BASE_URL}/api/files")
        files = json.loads(req.read().decode())
        match = [f for f in files if f["name"] == final_filename]
        if match:
            print(f"[Test 5: List Sync] Success. Found uploaded file in registry.")
        else:
            raise Exception("File not found in list")
    except Exception as e:
        print(f"[Test 5: List Sync] FAILED: {e}")
        return

    # 6. Test HTTP Range request (Read bytes 4 to 7: "EFGH")
    try:
        encoded_filename = urllib.parse.quote(final_filename)
        req = urllib.request.Request(f"{BASE_URL}/api/download/{encoded_filename}")
        req.add_header("Range", "bytes=4-7")
        res_conn = urllib.request.urlopen(req)
        
        status = res_conn.status
        content_range = res_conn.getheader("Content-Range")
        data = res_conn.read()
        
        if status == 206 and content_range == "bytes 4-7/12" and data == b"EFGH":
            print(f"[Test 6: Range Request] Success. Received expected bytes: {data.decode()} (Status {status})")
        else:
            raise Exception(f"Unexpected response status={status}, range={content_range}, data={data}")
    except Exception as e:
        print(f"[Test 6: Range Request] FAILED: {e}")
        return

    # 7. Clean up by deleting the file
    try:
        encoded_filename = urllib.parse.quote(final_filename)
        req = urllib.request.Request(
            f"{BASE_URL}/api/files/{encoded_filename}", 
            method="DELETE"
        )
        urllib.request.urlopen(req)
        print("[Test 7: File Deletion] Success. File removed from server.")
    except Exception as e:
        print(f"[Test 7: File Deletion] FAILED: {e}")
        return

    print("\n[Test Summary] All API endpoints successfully verified! AeroShare backend is fully operational.")

if __name__ == "__main__":
    test_api()
