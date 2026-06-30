import cv2
import numpy as np
import os
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

def preprocess_sheet_music(input_path, output_path, cropped_path=None, on_stage_change=None):
    """
    Orchestrate high-fidelity preprocessing pipeline for Audiveris OMR:
      1. Load BGR image preserving EXIF orientation.
      2. Check resolution & DPI validation.
      3. Grayscale conversion.
      4. Page border detection & Perspective warp (deskew).
      5. Estimate staff spacing spacing via run-length analysis.
      6. Resize/Upscale image proportionally (shortest side >= 2500px, spacing >= 16px).
      7. Denoise using Bilateral Filtering.
      8. Sharpen thin symbols using unsharp masking.
      9. Binarize using Adaptive Thresholding.
     10. Save binarized image at JPEG quality 95+.
    """
    # 1. Read BGR image with correct rotation
    img = read_image_with_orientation(input_path)
    h, w = img.shape[:2]
    
    # 2. DPI & Resolution validation
    dpi = get_image_dpi(input_path)
    print(f"[validation] Input dimensions: {w}x{h}, DPI: {dpi or 'Unknown'}")
    
    # Reject extremely small or empty uploads (e.g. thumbnails/icons)
    if min(h, w) < 50:
        raise OMRRecognitionError(
            f"The uploaded image size ({w}x{h}) is too small to contain musical sheet information."
        )
        
    # Check if the image is below the recommended resolution (e.g. shortest < 1500 or longest < 2000)
    low_res_warning = min(h, w) < 1500 or max(h, w) < 2000
    if low_res_warning:
        print(f"[validation] Image is below recommended resolution. Dimensions: {w}x{h}. Will apply Lanczos upscaling.")
        
    # 3. Grayscale conversion
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    quality_warning = analyze_exposure_and_contrast(gray)
    
    # 4. Crop & Correct perspective
    cropped = crop_and_correct_perspective(gray)
    ch, cw = cropped.shape
    
    # Save cropped image to file for visibility/logging
    if cropped_path:
        os.makedirs(os.path.dirname(cropped_path), exist_ok=True)
        cv2.imwrite(cropped_path, cropped)
        print(f"[preprocess] Cropped image path: {cropped_path}")
    
    # 5. Transition to 'detecting_staffs' stage
    if on_stage_change:
        on_stage_change("detecting_staffs")
        
    # Estimate staff spacing (do not reject yet if 0.0, we will try to detect staves after processing!)
    line_thickness, space_height = estimate_staff_spacing(cropped)
    print(f"[validation] Initial estimated line thickness: {line_thickness:.1f}px, space height: {space_height:.1f}px")
        
    # 6. Resize/Upscale proportionally based on aspect ratio
    aspect_ratio = cw / ch if ch > 0 else 1.0
    
    if aspect_ratio > 2.0:
        # Cropped single staff or system: scale longest side to 2800px and space to 16px
        longest_side = max(ch, cw)
        target_longest_side = 2800.0
        longest_side_scale = target_longest_side / longest_side
        
        spacing_scale = 1.0
        if space_height > 0:
            spacing_scale = 16.0 / space_height
            
        scale = max(longest_side_scale, spacing_scale)
        print(f"[preprocess] Cropped system/staff resizing. Aspect ratio: {aspect_ratio:.2f}")
    else:
        # Full-page or half-page: scale shortest side to 2800px and space to 16px
        shortest_side = min(ch, cw)
        target_shortest_side = 2800.0
        shortest_side_scale = target_shortest_side / shortest_side
        
        spacing_scale = 1.0
        if space_height > 0:
            spacing_scale = 16.0 / space_height
            
        scale = max(shortest_side_scale, spacing_scale)
        print(f"[preprocess] Full/half page resizing. Aspect ratio: {aspect_ratio:.2f}")
        
    # Limit scaling factor to prevent massive memory usage (max 5.0x scale)
    if scale > 5.0:
        scale = 5.0
        
    new_w = int(cw * scale)
    new_h = int(ch * scale)
    
    # Log original and upscaled dimensions (Requirement 4)
    print(f"[preprocess] Rescaled image path: {output_path}")
    print(f"[preprocess] Dimension transition: {cw}x{ch} (original) -> {new_w}x{new_h} (upscaled) [scale: {scale:.2f}x]")
    
    # Use high-quality Lanczos interpolation for resizing (Requirement 3)
    resized = cv2.resize(cropped, (new_w, new_h), interpolation=cv2.INTER_LANCZOS4)
    
    # 7. Denoise using Bilateral Filter (preserves sharp staff edges while removing paper texture)
    denoised = cv2.bilateralFilter(resized, 9, 75, 75)
    
    # 8. Sharpen thin symbols using Unsharp Mask
    blurred = cv2.GaussianBlur(denoised, (5, 5), 1.0)
    sharpened = cv2.addWeighted(denoised, 1.5, blurred, -0.5, 0)
    
    # 8.5. Contrast Enhancement using CLAHE (Requirement 2)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(sharpened)
    
    # 9. Binarize using Adaptive Thresholding
    # Scale block size with estimated upscaled staff spacing to prevent line erosion (Issue 6)
    estimated_upscaled_space = space_height * scale
    block_size = int(estimated_upscaled_space * 2) | 1
    if block_size < 15:
        block_size = 15
    elif block_size > 251:
        block_size = 251
        
    print(f"[preprocess] Adaptive threshold block size: {block_size}")
    binarized = cv2.adaptiveThreshold(
        enhanced,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        block_size,
        2
    )
    
    # Re-estimate spacing to verify quality and detect staves (Requirement 5)
    new_line_thick, new_space_height = estimate_staff_spacing(binarized)
    print(f"[preprocess] Post-preprocessed interline space spacing: {new_space_height:.1f}px")
    
    # Only reject the image if Audiveris / preprocessor still cannot detect valid musical staves after preprocessing (Requirement 5)
    if new_space_height == 0.0 or new_line_thick == 0.0:
        raise OMRRecognitionError(
            "No complete musical staff could be detected in the image after high-quality upscaling and preprocessing."
        )
        
    # 10. Save binarized image at high quality
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    success = cv2.imwrite(output_path, binarized, [cv2.IMWRITE_JPEG_QUALITY, 95])
    if not success:
        raise IOError(f"Failed to write preprocessed image to: {output_path}")
        
    return output_path, quality_warning, low_res_warning
