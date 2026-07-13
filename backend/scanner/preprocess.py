import cv2
import numpy as np
import os
import shutil
from PIL import Image as PILImage, ImageOps

class OMRRecognitionError(Exception):
    """Exception raised when the sheet music cannot be processed or recognized."""
    pass

def read_image_with_orientation(path):
    """
    Read an image using PIL to preserve EXIF orientation,
    then convert it to an OpenCV BGR format image.
    """
    if not os.path.exists(path):
        raise FileNotFoundError(f"Input image not found: {path}")
        
    try:
        with PILImage.open(path) as pil_img:
            # Transpose image based on EXIF orientation metadata
            pil_img = ImageOps.exif_transpose(pil_img)
            # Convert RGB PIL Image to BGR OpenCV format
            opencv_img = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
            return opencv_img
    except Exception as e:
        raise ValueError(f"Failed to load or rotate image at '{path}': {str(e)}")

def get_image_dpi(path):
    """Read DPI from image metadata if available."""
    try:
        with PILImage.open(path) as pil_img:
            dpi = pil_img.info.get('dpi')
            if dpi:
                return float(dpi[0])
    except Exception:
        pass
    return None

def analyze_exposure_and_contrast(gray_image):
    """
    Compute average brightness and standard deviation to detect poor lighting
    or low contrast exposures.
    """
    mean_val = np.mean(gray_image)
    std_dev = np.std(gray_image)
    
    is_poor_exposure = mean_val < 50 or mean_val > 220
    is_low_contrast = std_dev < 15
    
    print(f"[validation] Image quality metrics: mean={mean_val:.1f}, std={std_dev:.1f}")
    if is_poor_exposure:
        print("[validation] WARNING: Poor exposure detected (too dark or too bright).")
    if is_low_contrast:
        print("[validation] WARNING: Low contrast detected.")
        
    return is_poor_exposure or is_low_contrast

def crop_and_correct_perspective(gray_image):
    """
    Detect the page boundary of the music sheet, correct perspective tilt,
    and crop to the sheet area. Falls back to bounding rect crop or whole image.
    """
    h, w = gray_image.shape
    aspect_ratio = w / h if h > 0 else 1.0
    
    # If the image is highly rectangular/wide, it represents a cropped staff or system.
    # Page detection and perspective warping on this will distort the staves, so skip it.
    if aspect_ratio > 2.0:
        print(f"[preprocess] Aspect ratio is wide ({aspect_ratio:.2f}). Skipping page perspective warp.")
        return gray_image
        
    total_area = h * w
    
    # 1. Bilateral filter to reduce noise while keeping page edges crisp
    blurred = cv2.bilateralFilter(gray_image, 9, 75, 75)
    
    # 2. Canny edge detection
    edges = cv2.Canny(blurred, 30, 120)
    
    # Dilate edges to close gaps in outline
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    edges = cv2.dilate(edges, kernel, iterations=1)
    
    # 3. Find contours
    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    if not contours:
        return gray_image
        
    # Sort contours by area in descending order
    contours = sorted(contours, key=cv2.contourArea, reverse=True)
    
    for contour in contours:
        area = cv2.contourArea(contour)
        # We only consider page-like contours that take up a significant portion of the image
        if area < total_area * 0.15:
            break
            
        # Approximate contour to a polygon
        perimeter = cv2.arcLength(contour, True)
        approx = cv2.approxPolyDP(contour, 0.02 * perimeter, True)
        
        # If it has 4 corners and is convex, warp perspective
        if len(approx) == 4 and cv2.isContourConvex(approx):
            pts = approx.reshape(4, 2)
            rect = np.zeros((4, 2), dtype="float32")
            
            s = pts.sum(axis=1)
            rect[0] = pts[np.argmin(s)] # Top-Left
            rect[2] = pts[np.argmax(s)] # Bottom-Right
            
            diff = np.diff(pts, axis=1)
            rect[1] = pts[np.argmin(diff)] # Top-Right
            rect[3] = pts[np.argmax(diff)] # Bottom-Left
            
            (tl, tr, br, bl) = rect
            
            # Compute width of target warped image
            widthA = np.sqrt(((br[0] - bl[0]) ** 2) + ((br[1] - bl[1]) ** 2))
            widthB = np.sqrt(((tr[0] - tl[0]) ** 2) + ((tr[1] - tl[1]) ** 2))
            maxWidth = max(int(widthA), int(widthB))
            
            # Compute height of target warped image
            heightA = np.sqrt(((tr[0] - br[0]) ** 2) + ((tr[1] - br[1]) ** 2))
            heightB = np.sqrt(((tl[0] - bl[0]) ** 2) + ((tl[1] - bl[1]) ** 2))
            maxHeight = max(int(heightA), int(heightB))
            
            # Ensure dimensions are valid
            if maxWidth > 100 and maxHeight > 100:
                dst = np.array([
                    [0, 0],
                    [maxWidth - 1, 0],
                    [maxWidth - 1, maxHeight - 1],
                    [0, maxHeight - 1]
                ], dtype="float32")
                
                M = cv2.getPerspectiveTransform(rect, dst)
                warped = cv2.warpPerspective(gray_image, M, (maxWidth, maxHeight))
                print(f"[preprocess] Corrected perspective warp. Contour area: {area:.0f} px")
                return warped
            
    # Fallback 1: Crop to bounding rect of the largest contour
    largest_area = cv2.contourArea(contours[0])
    if largest_area > total_area * 0.15:
        x, y, cw, ch = cv2.boundingRect(contours[0])
        pad = 10
        x_start = max(0, x - pad)
        y_start = max(0, y - pad)
        x_end = min(w, x + cw + pad)
        y_end = min(h, y + ch + pad)
        if (x_end - x_start) > 100 and (y_end - y_start) > 100:
            cropped = gray_image[y_start:y_end, x_start:x_end]
            print(f"[preprocess] Bounding rect fallback crop. Area: {largest_area:.0f} px")
            return cropped
            
    return gray_image

def estimate_staff_spacing(gray_image):
    """
    Estimate staff line thickness and staff space height (interline spacing)
    using vertical run-length analysis of white (spaces) and black (lines) runs.
    """
    # Create temporary thresholded image to count runs
    _, binary = cv2.threshold(gray_image, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)
    
    h, w = binary.shape
    cols = np.linspace(0, w - 1, min(30, w), dtype=int)
    
    black_runs = []
    white_runs = []
    
    for col in cols:
        col_pixels = binary[:, col]
        transitions = np.diff(col_pixels)
        transition_indices = np.where(transitions != 0)[0]
        
        if len(transition_indices) < 2:
            continue
            
        run_lengths = np.diff(transition_indices)
        run_values = col_pixels[transition_indices[:-1] + 1]
        
        for val, length in zip(run_values, run_lengths):
            if val == 0:  # Black run
                black_runs.append(length)
            else:         # White run
                white_runs.append(length)
                
    if not white_runs or not black_runs:
        return 0.0, 0.0
        
    # Widened limits to support thick staff lines and large spaces in upscaled images
    valid_space_runs = [r for r in white_runs if 4 <= r <= 150]
    valid_line_runs = [r for r in black_runs if 1 <= r <= 45]
    
    if not valid_space_runs or not valid_line_runs:
        return 0.0, 0.0
        
    line_thickness = float(np.median(valid_line_runs))
    space_height = float(np.median(valid_space_runs))
    
    return line_thickness, space_height

def detect_skew_angle(gray_image):
    """
    Detect the skew angle of the sheet music using Hough Line Transform.
    """
    h, w = gray_image.shape
    edges = cv2.Canny(gray_image, 50, 150, apertureSize=3)
    # Detect lines with min length 20% of image width
    lines = cv2.HoughLinesP(edges, 1, np.pi / 180, 100, minLineLength=max(50, w // 5), maxLineGap=20)
    if lines is None:
        return 0.0
    angles = []
    for line in lines:
        x1, y1, x2, y2 = line[0]
        angle = np.arctan2(y2 - y1, x2 - x1) * 180 / np.pi
        # We only consider horizontal-like lines (-30 to +30 degrees)
        if -30 <= angle <= 30:
            angles.append(angle)
    if not angles:
        return 0.0
    return float(np.median(angles))

def rotate_image(image, angle):
    """Rotate image by a specific angle around its center."""
    if abs(angle) < 0.5:
        return image
    h, w = image.shape[:2]
    center = (w // 2, h // 2)
    M = cv2.getRotationMatrix2D(center, angle, 1.0)
    rotated = cv2.warpAffine(image, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
    return rotated

def evaluate_staff_clarity(binary_image):
    """
    Validate the clarity of staff lines in a binarized image.
    Returns a score representing the clarity/visibility of staff lines.
    """
    h, w = binary_image.shape
    kernel_width = max(15, w // 25)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (kernel_width, 1))
    
    inverted = cv2.bitwise_not(binary_image)
    horizontal = cv2.morphologyEx(inverted, cv2.MORPH_OPEN, kernel)
    
    contours, _ = cv2.findContours(horizontal, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    horiz_contours = []
    for c in contours:
        x, y, cw, ch = cv2.boundingRect(c)
        if cw >= 3 * ch and cw > (w // 10):
            horiz_contours.append(c)
            
    num_lines = len(horiz_contours)
    line_thick, space_height = estimate_staff_spacing(binary_image)
    
    # If no lines or spacing detected, it fails staff preservation
    if num_lines < 3 or space_height == 0.0 or line_thick == 0.0:
        return 0.0
        
    noise_pixels = np.sum(inverted) - np.sum(horizontal)
    noise_ratio = noise_pixels / max(1, np.sum(inverted))
    
    clarity_score = num_lines * (1.0 - noise_ratio)
    return float(clarity_score)

def analyze_image_properties(gray):
    """Analyze exposure, sharpness, noise, and skew parameters."""
    h, w = gray.shape
    mean_val = float(np.mean(gray))
    std_dev = float(np.std(gray))
    sharpness = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    
    denoised = cv2.medianBlur(gray, 3)
    noise_est = float(np.std(cv2.absdiff(gray, denoised)))
    
    skew_angle = detect_skew_angle(gray)
    line_thickness, space_height = estimate_staff_spacing(gray)
    
    return {
        "width": w,
        "height": h,
        "brightness": mean_val,
        "contrast": std_dev,
        "sharpness": sharpness,
        "noise": noise_est,
        "skew_angle": skew_angle,
        "space_height": space_height,
        "line_thickness": line_thickness
    }

def generate_preprocessing_candidates(gray_image, metrics):
    """Generate multiple preprocessed candidates using different strategies."""
    h, w = gray_image.shape
    candidates = []
    
    # 1. Flatten Illumination (Division Normalization to remove shadows)
    kernel_size = max(19, min(w, h) // 40) | 1
    struct_element = cv2.getStructuringElement(cv2.MORPH_RECT, (kernel_size, kernel_size))
    background = cv2.morphologyEx(gray_image, cv2.MORPH_CLOSE, struct_element)
    background = cv2.GaussianBlur(background, (21, 21), 0)
    flat_gray = cv2.divide(gray_image, background, scale=255)
    
    # Deskew if skew detected
    skew = metrics["skew_angle"]
    if abs(skew) >= 0.5:
        flat_gray = rotate_image(flat_gray, skew)
        
    # Scale image (Lanczos upscaling shortest side to 2800px)
    space_height = metrics["space_height"]
    scale = 1.0
    if space_height > 0:
        scale = 16.0 / space_height
    if scale > 5.0:
        scale = 5.0
    elif scale < 0.5:
        scale = 0.5
        
    new_w, new_h = int(w * scale), int(h * scale)
    resized_flat = cv2.resize(flat_gray, (new_w, new_h), interpolation=cv2.INTER_LANCZOS4)
    
    # Setup adaptive block size
    block_size = 31
    
    # Candidate 1: Standard Adaptive Threshold (Division + Bilateral + Unsharp + CLAHE + Adaptive)
    try:
        denoised = cv2.bilateralFilter(resized_flat, 9, 75, 75)
        blurred = cv2.GaussianBlur(denoised, (5, 5), 1.0)
        sharpened = cv2.addWeighted(denoised, 1.5, blurred, -0.5, 0)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(sharpened)
        bin_adaptive = cv2.adaptiveThreshold(
            enhanced, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, block_size, 2
        )
        score = evaluate_staff_clarity(bin_adaptive)
        if score > 0.0:
            candidates.append({"name": "Adaptive", "image": bin_adaptive, "score": score})
    except Exception as e:
        print(f"[preprocess] Candidate 1 failed: {e}")

    # Candidate 2: Otsu Binarization (Division + CLAHE + Otsu)
    try:
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(resized_flat)
        _, bin_otsu = cv2.threshold(enhanced, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)
        score = evaluate_staff_clarity(bin_otsu)
        if score > 0.0:
            candidates.append({"name": "Otsu", "image": bin_otsu, "score": score})
    except Exception as e:
        print(f"[preprocess] Candidate 2 failed: {e}")

    # Candidate 3: High Contrast (Division + Strong CLAHE + Adaptive)
    try:
        denoised = cv2.bilateralFilter(resized_flat, 9, 75, 75)
        clahe = cv2.createCLAHE(clipLimit=4.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(denoised)
        bin_high = cv2.adaptiveThreshold(
            enhanced, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, block_size, 2
        )
        score = evaluate_staff_clarity(bin_high)
        if score > 0.0:
            candidates.append({"name": "HighContrast", "image": bin_high, "score": score})
    except Exception as e:
        print(f"[preprocess] Candidate 3 failed: {e}")

    # Candidate 4: Enhanced Denoised (Bilateral + Median + Adaptive)
    try:
        denoised = cv2.bilateralFilter(resized_flat, 9, 75, 75)
        median = cv2.medianBlur(denoised, 3)
        bin_denoised = cv2.adaptiveThreshold(
            median, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, block_size, 2
        )
        score = evaluate_staff_clarity(bin_denoised)
        if score > 0.0:
            candidates.append({"name": "Denoised", "image": bin_denoised, "score": score})
    except Exception as e:
        print(f"[preprocess] Candidate 4 failed: {e}")
        
    if not candidates:
        print("[preprocess] No candidates passed staff line validation. Generating fallback standard binarization.")
        bin_adaptive = cv2.adaptiveThreshold(
            resized_flat, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, block_size, 2
        )
        candidates.append({"name": "Fallback", "image": bin_adaptive, "score": 1.0})
        
    candidates.sort(key=lambda x: x["score"], reverse=True)
    return candidates

def preprocess_sheet_music_candidates(input_path, base_output_path, cropped_path=None, on_stage_change=None):
    """
    Preprocess sheet music and generate multiple binarized candidate file paths.
    Returns:
        tuple: (list of dict, quality_warning, low_res_warning)
    """
    img = read_image_with_orientation(input_path)
    h, w = img.shape[:2]
    
    dpi = get_image_dpi(input_path)
    print(f"[validation] Input dimensions: {w}x{h}, DPI: {dpi or 'Unknown'}")
    
    if min(h, w) < 50:
        raise OMRRecognitionError(
            f"The uploaded image size ({w}x{h}) is too small to contain musical sheet information."
        )
        
    low_res_warning = min(h, w) < 1500 or max(h, w) < 2000
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    quality_warning = analyze_exposure_and_contrast(gray)
    
    cropped = crop_and_correct_perspective(gray)
    
    if cropped_path:
        os.makedirs(os.path.dirname(cropped_path), exist_ok=True)
        cv2.imwrite(cropped_path, cropped)
        print(f"[preprocess] Cropped image path: {cropped_path}")
        
    if on_stage_change:
        on_stage_change("detecting_staffs")
        
    metrics = analyze_image_properties(cropped)
    print(f"[analysis] Properties: Brightness={metrics['brightness']:.1f}, Contrast={metrics['contrast']:.1f}, Skew={metrics['skew_angle']:.2f}°")
    
    candidates = generate_preprocessing_candidates(cropped, metrics)
    saved_candidates = []
    output_dir = os.path.dirname(base_output_path)
    base_filename = os.path.basename(base_output_path)
    name_part, ext_part = os.path.splitext(base_filename)
    
    for i, cand in enumerate(candidates):
        cand_name = cand["name"]
        cand_score = cand["score"]
        cand_filename = f"{name_part}_{chr(65+i)}_{cand_name}{ext_part}"
        cand_path = os.path.join(output_dir, cand_filename)
        
        os.makedirs(os.path.dirname(cand_path), exist_ok=True)
        success = cv2.imwrite(cand_path, cand["image"], [cv2.IMWRITE_JPEG_QUALITY, 95])
        if success:
            print(f"[preprocess] Saved Candidate {i+1}: {cand_name} (Clarity Score: {cand_score:.1f}) -> {cand_path}")
            saved_candidates.append({
                "name": cand_name,
                "path": cand_path,
                "score": cand_score
            })
            
    return saved_candidates, quality_warning, low_res_warning

def preprocess_sheet_music(input_path, output_path, cropped_path=None, on_stage_change=None):
    """Fallback compatibility wrapper."""
    candidates, quality_warning, low_res_warning = preprocess_sheet_music_candidates(
        input_path, output_path, cropped_path, on_stage_change
    )
    if candidates:
        shutil.copy2(candidates[0]["path"], output_path)
    return output_path, quality_warning, low_res_warning
