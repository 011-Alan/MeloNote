import os
import zipfile
import xml.etree.ElementTree as ET

class MusicXMLParser:
    @staticmethod
    def extract_from_mxl(mxl_path):
        """
        Extract the main MusicXML text string from a compressed MXL archive.
        
        Args:
            mxl_path (str): Path to the .mxl file.
            
        Returns:
            str: Decoded MusicXML content.
        """
        if not os.path.exists(mxl_path):
            raise FileNotFoundError(f"MXL file not found at: {mxl_path}")
            
        if not zipfile.is_zipfile(mxl_path):
            raise ValueError(f"File at {mxl_path} is not a valid MXL/ZIP archive.")
            
        with zipfile.ZipFile(mxl_path, 'r') as zip_ref:
            # Look for the score.xml or any XML score file in the archive
            for file_name in zip_ref.namelist():
                if file_name.endswith('.xml') and not file_name.startswith('META-INF'):
                    try:
                        content = zip_ref.read(file_name)
                        return content.decode('utf-8')
                    except Exception as e:
                        raise ValueError(f"Failed to read XML content '{file_name}' from MXL archive: {str(e)}")
                        
        raise ValueError("No valid MusicXML file found in MXL archive. Missing root sheet definition.")

    @staticmethod
    def validate_musicxml(xml_content):
        """
        Validate that the provided string is valid XML, contains a standard
        MusicXML root element, and has at least one musical note element.
        
        Args:
            xml_content (str): The XML content string.
            
        Returns:
            bool: True if valid, raises ValueError if invalid.
        """
        if not xml_content or not xml_content.strip():
            raise ValueError("MusicXML content is empty.")
            
        try:
            # Parse XML structure to check for malformed tags
            root = ET.fromstring(xml_content)
        except ET.ParseError as e:
            raise ValueError(f"Malformed XML syntax. Parsing error: {str(e)}")
            
        # Verify it has a standard MusicXML root tag
        valid_tags = {"score-partwise", "score-timewise"}
        if root.tag not in valid_tags:
            raise ValueError(
                f"Invalid MusicXML document. Expected root tag to be one of {valid_tags}, "
                f"but found: '{root.tag}'"
            )
            
        # Verify that the MusicXML contains note elements (Issue 3)
        note_tags = root.findall(".//note")
        pitch_notes = [n for n in note_tags if n.find("rest") is None]
        
        print(f"[parser] MusicXML Validation: found {len(note_tags)} total <note> tags, {len(pitch_notes)} pitched notes.")
        
        if len(note_tags) == 0:
            raise ValueError(
                "No musical notes were detected. Please use a clearer, higher-resolution image or retake the photo."
            )
            
        return True

    @classmethod
    def process_and_validate(cls, file_path):
        """
        Load, extract (if compressed), and validate the MusicXML score.
        
        Args:
            file_path (str): Path to either a .mxl or .xml file.
            
        Returns:
            str: Validated MusicXML content string.
        """
        print(f"[parser] MusicXML file path: {file_path}")
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"OMR output file not found: {file_path}")
            
        _, ext = os.path.splitext(file_path.lower())
        
        if ext == '.mxl':
            xml_content = cls.extract_from_mxl(file_path)
        elif ext in ('.xml', '.musicxml'):
            with open(file_path, 'r', encoding='utf-8') as f:
                xml_content = f.read()
        else:
            raise ValueError(f"Unsupported file extension for parsing: '{ext}'")
            
        # Validate syntax and contents
        cls.validate_musicxml(xml_content)
        
        return xml_content
