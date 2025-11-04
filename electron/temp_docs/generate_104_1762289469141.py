
import sys
import os
import json
import base64
import traceback

# Add the parent directory to Python path
script_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.append(os.path.dirname(script_dir))

try:
    # Import the document processing function
    from generate_docs import process_teacher_document
    
    # Get input data from command line arguments
    if len(sys.argv) < 2:
        raise ValueError("No input data provided")
    
    # Parse input data
    input_data = json.loads(sys.argv[1])
    
    # Extract parameters
    template_path = input_data.get('template_path')
    teacher_name = input_data.get('teacher_name')
    sessions_data = input_data.get('sessions_data', {})
    
    # Generate PDF
    pdf_buffer = process_teacher_document(template_path, teacher_name, sessions_data)
    
    # Return result as base64
    result = {
        'success': True,
        'pdf_buffer': base64.b64encode(pdf_buffer.getvalue()).decode('utf-8'),
        'teacher_name': teacher_name,
        'surveillances_count': sum(len(sessions) for sessions in sessions_data.values())
    }
    print(json.dumps(result))
    
except Exception as e:
    # Handle errors and return them as JSON
    result = {
        'success': False,
        'error': str(e),
        'traceback': traceback.format_exc()
    }
    print(json.dumps(result))
    sys.exit(1)
