# download_model.py
import os
import urllib.request

def download():
    dest_dir = os.path.expanduser("~/piano_transcription_inference_data")
    os.makedirs(dest_dir, exist_ok=True)
    
    dest_path = os.path.join(dest_dir, "note_F1=0.9677_pedal_F1=0.9186.pth")
    if os.path.exists(dest_path):
        print(f"Model already exists at: {dest_path}")
        return
        
    url = "https://zenodo.org/record/4034264/files/CRNN_note_F1%3D0.9677_pedal_F1%3D0.9186.pth?download=1"
    print(f"Downloading pre-trained model to {dest_path}...")
    
    def report_progress(block_num, block_size, total_size):
        read_so_far = block_num * block_size
        if total_size > 0:
            percent = read_so_far * 100 / total_size
            print(f"\rProgress: {percent:.1f}% ({read_so_far}/{total_size} bytes)", end="")
        else:
            print(f"\rRead: {read_so_far} bytes", end="")
            
    urllib.request.urlretrieve(url, dest_path, reporthook=report_progress)
    print("\nDownload complete!")

if __name__ == "__main__":
    download()
