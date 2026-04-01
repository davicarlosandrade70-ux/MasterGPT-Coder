import subprocess
import sys
import os

# Fix encoding issues on Windows
if sys.platform == "win32":
    import io
    if hasattr(sys.stdout, 'buffer'):
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    if hasattr(sys.stderr, 'buffer'):
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

def run():
    print("Starting MasterGPT-Coder...")
    
    # Check if we are in the right directory
    if not os.path.exists("backend") or not os.path.exists("frontend"):
        print(" Error: Directory structure is incorrect. Please run this from the project root.")
        return

    # Install requirements
    print(" Installing dependencies...")
    try:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", "requirements.txt"])
    except subprocess.CalledProcessError:
        print("Failed to install dependencies. Make sure you have pip installed.")
        return

    # Start the server
    print("Server starting at http://localhost:8000")
    try:
        # Start uvicorn
        subprocess.check_call([sys.executable, "-m", "uvicorn", "backend.main:app", "--reload", "--host", "0.0.0.0", "--port", "8000"])
    except KeyboardInterrupt:
        print("\n MasterGPT stopped.")
    except Exception as e:
        print(f"Error starting server: {e}")

if __name__ == "__main__":
    run()
