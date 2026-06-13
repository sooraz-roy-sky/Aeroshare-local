import urllib.request
import urllib.parse
import json

BASE_URL = "http://localhost:8080"
filename = "test_verification_file (3).bin"
encoded_filename = urllib.parse.quote(filename)
url = f"{BASE_URL}/api/files/{encoded_filename}"

print("Sending DELETE to:", url)
req = urllib.request.Request(url, method="DELETE")
try:
    with urllib.request.urlopen(req) as res:
        print("Status:", res.status)
        print("Headers:", res.headers.items())
        print("Body:", res.read())
except urllib.error.HTTPError as e:
    print("HTTP Error:", e.code, e.reason)
    print("Body:", e.read().decode())
