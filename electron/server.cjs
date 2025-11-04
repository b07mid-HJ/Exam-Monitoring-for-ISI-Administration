const dotenv = require('dotenv');
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');
const fsPromises = fs.promises;
const { exec } = require('child_process');
const { promisify } = require('util');
const { join } = path;
const { existsSync, mkdirSync, writeFileSync, unlinkSync } = fs;

const execPromise = promisify(exec);

// Get the current directory
const currentDir = __dirname || process.cwd();

// Load environment variables
const envPath = path.resolve(process.cwd(), '.env');
dotenv.config({ path: envPath });

// Validate required environment variables
const requiredEnvVars = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
}

// Configure SMTP transport
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    tls: {
      rejectUnauthorized: process.env.NODE_ENV !== 'development'
    }
  });
};

// Helper function to generate email content
function createEmailContent(teacher, sessions) {
  const teacherName = `${teacher.firstName} ${teacher.lastName}`;
  
  const text = `Bonjour ${teacherName},

Veuillez trouver ci-joint votre convocation pour la surveillance des examens.

Détails de vos sessions de surveillance:
${sessions.map(s => 
  `- ${s.date} de ${s.startTime} à ${s.endTime} (${s.duration.toFixed(1)}h) - ${s.session || ''}`
).join('\n')}

Cordialement,
L'administration`;

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #2c3e50;">Bonjour ${teacherName},</h2>
      <p>Veuillez trouver ci-joint votre convocation pour la surveillance des examens.</p>
      
      <h3 style="color: #2c3e50; margin-top: 20px;">Détails de vos sessions :</h3>
      <table style="width: 100%; border-collapse: collapse; margin: 15px 0; border: 1px solid #ddd;">
        <thead>
          <tr style="background-color: #f5f5f5;">
            <th style="padding: 10px; text-align: left; border: 1px solid #ddd;">Date</th>
            <th style="padding: 10px; text-align: left; border: 1px solid #ddd;">Heure</th>
            <th style="padding: 10px; text-align: left; border: 1px solid #ddd;">Session</th>
          </tr>
        </thead>
        <tbody>
          ${sessions.map(session => `
            <tr>
              <td style="padding: 10px; border: 1px solid #ddd;">${session.date}</td>
              <td style="padding: 10px; border: 1px solid #ddd;">${session.startTime} - ${session.endTime}</td>
              <td style="padding: 10px; border: 1px solid #ddd;">${session.session || ''}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      
      <p style="margin-top: 20px;">Cordialement,<br>L'administration</p>
    </div>`;

  return { text, html };
}

// Helper function to validate teacher object
function isValidTeacher(teacher) {
  // Check basic structure
  if (!teacher || typeof teacher !== 'object') {
    console.log('Invalid teacher: Not an object', teacher);
    return false;
  }

  // Check required fields
  const requiredFields = ['id', 'email', 'firstName', 'lastName', 'sessions'];
  const missingFields = requiredFields.filter(field => !(field in teacher));
  
  if (missingFields.length > 0) {
    console.log('Invalid teacher: Missing required fields', { 
      id: teacher.id,
      email: teacher.email,
      missingFields 
    });
    return false;
  }

  // Check field types
  if (typeof teacher.id !== 'number' && typeof teacher.id !== 'string') {
    console.log('Invalid teacher: ID must be a number or string', { id: teacher.id });
    return false;
  }

  if (typeof teacher.email !== 'string' || !teacher.email.includes('@')) {
    console.log('Invalid teacher: Invalid email', { email: teacher.email });
    return false;
  }

  if (typeof teacher.firstName !== 'string' || !teacher.firstName.trim()) {
    console.log('Invalid teacher: Missing or invalid firstName', { firstName: teacher.firstName });
    return false;
  }

  if (typeof teacher.lastName !== 'string' || !teacher.lastName.trim()) {
    console.log('Invalid teacher: Missing or invalid lastName', { lastName: teacher.lastName });
    return false;
  }

  if (!Array.isArray(teacher.sessions) || teacher.sessions.length === 0) {
    console.log('Invalid teacher: No sessions found', { sessionCount: teacher.sessions?.length });
    return false;
  }

  // All checks passed
  return true;
}

// Main function to send emails
async function sendEmails(teachers) {
  const transporter = createTransporter();
  const BATCH_SIZE = 5; // Process 5 emails at a time
  const results = [];

  // Input validation
  if (!Array.isArray(teachers)) {
    throw new Error('Expected an array of teachers');
  }

  console.log(`[Email] Received ${teachers.length} teachers to process`);
  
  // Log teacher IDs for debugging
  console.log('[Email] Teacher IDs:', teachers.map(t => ({
    id: t?.id,
    email: t?.email,
    hasSessions: Array.isArray(t?.sessions) ? t.sessions.length : 'invalid'
  })));

  // Filter out invalid teachers
  const validTeachers = [];
  const invalidTeachers = [];
  
  teachers.forEach(teacher => {
    if (isValidTeacher(teacher)) {
      validTeachers.push(teacher);
    } else {
      invalidTeachers.push({
        id: teacher?.id,
        email: teacher?.email,
        error: 'Invalid teacher data',
        data: teacher
      });
    }
  });

  // Log invalid teachers
  if (invalidTeachers.length > 0) {
    console.warn(`[Email] Skipping ${invalidTeachers.length} invalid teacher records.`);
    console.warn('[Email] Invalid teachers details:', JSON.stringify(invalidTeachers, null, 2));
  }

  // If no valid teachers, return early
  if (validTeachers.length === 0) {
    return {
      success: false,
      error: 'No valid teachers found to send emails to',
      summary: {
        total: 0,
        successful: 0,
        failed: 0,
        timestamp: new Date().toISOString()
      },
      results: []
    };
  }

  // Process valid teachers in batches
  for (let i = 0; i < validTeachers.length; i += BATCH_SIZE) {
    const batch = validTeachers.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.allSettled(
      batch.map(teacher => sendTeacherEmail(teacher, transporter))
    );
    
    // Convert Promise.allSettled results to our format
    const formattedResults = batchResults.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        const teacher = batch[index];
        return {
          success: false,
          email: teacher?.email || 'unknown',
          name: teacher ? `${teacher.firstName} ${teacher.lastName}` : 'Unknown',
          error: result.reason.message,
          message: 'Failed to send email'
        };
      }
    });
    
    results.push(...formattedResults);
    
    // Add delay between batches (1 second)
    if (i + BATCH_SIZE < validTeachers.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // Calculate summary
  const successful = results.filter(r => r.success).length;
  const failed = results.length - successful;

  return {
    success: failed === 0,
    summary: {
      total: results.length,
      successful,
      failed,
      timestamp: new Date().toISOString()
    }, 
    results
  };
}

// Helper function to send email to a single teacher
async function sendTeacherEmail(teacher, transporter) {
  const { email, firstName, lastName, sessions = [] } = teacher;
  const teacherName = `${firstName} ${lastName}`;

  try {
    // Validate teacher data
    if (!email || !firstName || !lastName) {
      throw new Error('Missing required teacher information');
    }

    if (sessions.length === 0) {
      throw new Error('No sessions found for this teacher');
    }

    const { text, html } = createEmailContent(teacher, sessions);
    
    // Prepare email options
    const emailOptions = {
      from: `"Administration ISI" <${process.env.SMTP_USER}>`,
      to: email,
      subject: 'Votre convocation pour la surveillance des examens',
      text,
      html
    };

    // Add PDF attachment if enabled
    if (process.env.ATTACH_DOCUMENTS === 'true') {
      try {
        console.log(`[Email] Generating PDF for ${teacherName} (ID: ${teacher.id})`);
        const pdfBuffer = await generatePdf(teacher);
        
        if (!(pdfBuffer instanceof Buffer) || pdfBuffer.length === 0) {
          throw new Error('Generated PDF is empty or invalid');
        }
        
        emailOptions.attachments = [{
          filename: `convocation_${lastName}_${firstName}.pdf`,
          content: pdfBuffer
        }];
        
        console.log(`[Email] Successfully generated PDF for ${teacherName} (${pdfBuffer.length} bytes)`);
      } catch (pdfError) {
        console.error(`[Email] Failed to generate PDF for ${teacherName}:`, pdfError);
        // Continue without attachment but log the error
        emailOptions.text += `\n\n[NOTE: Could not attach PDF: ${pdfError.message}]`;
        emailOptions.html += `\n<p style="color: red;">[NOTE: Could not attach PDF: ${pdfError.message}]</p>`;
      }
    }

    // Send email
    const info = await transporter.sendMail(emailOptions);
    
    return {
      success: true,
      email,
      name: teacherName,
      messageId: info.messageId,
      message: 'Email sent successfully'
    };

  } catch (error) {
    console.error(`Error sending email to ${email}:`, error);
    return {
      success: false,
      email,
      name: teacherName,
      error: error.message,
      message: 'Failed to send email'
    };
  }
}


async function generateTeacherPDF(teacher) {
  try {
    if (!teacher || typeof teacher !== 'object') {
      throw new Error('Invalid teacher data provided');
    }

    // Verify required teacher properties
    const requiredProps = ['id', 'firstName', 'lastName', 'sessions'];
    const missingProps = requiredProps.filter(prop => !(prop in teacher));
    if (missingProps.length > 0) {
      throw new Error(`Missing required teacher properties: ${missingProps.join(', ')}`);
    }

    // Ensure sessions is an array
    if (!Array.isArray(teacher.sessions)) {
      throw new Error('Teacher sessions must be an array');
    }

    // Verify at least one session exists
    if (teacher.sessions.length === 0) {
      throw new Error('No sessions found for teacher');
    }

    // Define possible template paths to check
    console.log("why1");
    const possibleTemplatePaths = [
      path.join(__dirname, 'python', 'Convocation.docx')
    ];
    
    let templatePath = '';
    
    // Check each possible path
    for (const possiblePath of possibleTemplatePaths) {
      console.log(`[PDF Generation] Checking template path: ${possiblePath}`);
      if (fs.existsSync(possiblePath)) {
        templatePath = possiblePath;
        console.log(`[PDF Generation] Found template at: ${templatePath}`);
        break;
      }
    }
    
    // If template not found, throw error with all checked paths
    if (!templatePath) {
      throw new Error(`Template file not found. Checked the following locations:\n${
        possibleTemplatePaths.map(p => `- ${p}`).join('\n')
      }`);
    }
    
    const teacherFullName = `${teacher.firstName} ${teacher.lastName}`;
    console.log(`[PDF Generation] Starting PDF generation for: ${teacherFullName}`);

    // Define temp directory path
    const tempDocsDir = path.join(__dirname, 'temp_docs');
    
    // Create temp directory if it doesn't exist
    try {
      if (!fs.existsSync(tempDocsDir)) {
        console.log(`[PDF Generation] Creating temp directory: ${tempDocsDir}`);
        fs.mkdirSync(tempDocsDir, { recursive: true });
      }
    } catch (error) {
      console.error(`[PDF Generation] Error creating temp directory:`, error);
      throw new Error(`Failed to create temp directory: ${error.message}`);
    }

    // Verify template exists
    if (!existsSync(templatePath)) {
      const errorMsg = `Template file not found at: ${templatePath}`;
      console.error(`[PDF Generation] ${errorMsg}`);
      throw new Error(errorMsg);
    }

    // Format the data for the Python function
    const sessionsByDate = {};
    try {
      // First, log the teacher object to verify its structure
      console.log('[PDF Generation] Teacher object:', JSON.stringify({
        id: teacher.id,
        firstName: teacher.firstName,
        lastName: teacher.lastName,
        email: teacher.email,
        sessionCount: teacher.sessions?.length
      }, null, 2));

      // Process sessions
      teacher.sessions.forEach((session, index) => {
        if (!session || typeof session !== 'object') {
          console.warn(`[PDF Generation] Invalid session at index ${index}, skipping`);
          return;
        }

        const requiredSessionProps = ['date', 'startTime', 'endTime'];
        const missingSessionProps = requiredSessionProps.filter(prop => !(prop in session));
        
        if (missingSessionProps.length > 0) {
          console.warn(`[PDF Generation] Session at index ${index} missing required properties: ${missingSessionProps.join(', ')}`);
          return;
        }

        const dateKey = session.date;
        if (!sessionsByDate[dateKey]) {
          sessionsByDate[dateKey] = [];
        }
        
        sessionsByDate[dateKey].push([
          session.startTime || '',
          session.endTime || '',
          session.duration || 0
        ]);
      });
    } catch (error) {
      console.error('[PDF Generation] Error processing sessions:', error);
      throw new Error(`Failed to process sessions: ${error.message}`);
    }

    const teacherData = sessionsByDate;
    
    // Verify teacher ID is present and valid
    if (!teacher.id) {
      throw new Error('Teacher ID is missing in the teacher object');
    }
    
    // Convert teacher ID to string and trim any whitespace
    const teacherId = String(teacher.id).trim();
    if (!teacherId) {
      throw new Error('Teacher ID is empty after conversion to string');
    }
    
    console.log(`[PDF Generation] Processed ${Object.keys(teacherData).length} days of sessions for ${teacherFullName} (ID: ${teacherId})`);
    console.log(`[PDF Generation] Processed ${Object.keys(teacherData).length} days of sessions for ${teacherFullName}`);

    // Create a temporary Python script
    const tempScriptPath = join(tempDocsDir, `generate_${teacher.id}_${Date.now()}.py`);
    
    // Helper to format Windows paths for Python
    const toPythonPath = (p) => p ? p.replace(/\\/g, '\\\\') : '';
  
    // Generate Python script content
    const pythonScript = `
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
`;
console.log(`[PDF Generation] Writing Python script to: ${tempScriptPath}`);
    
    try {
      // Write the Python script
      writeFileSync(tempScriptPath, pythonScript);
      console.log(`[PDF Generation] Successfully wrote Python script`);
      
      // Prepare input data as JSON string
      const inputData = JSON.stringify({
        template_path: templatePath,
        teacher_name: teacherFullName,
        teacher_id: teacher.id,
        sessions_data: sessionsByDate
      });

      // Execute Python script with input data as argument
      console.log(`[PDF Generation] Executing Python script...`);
      const command = `python "${tempScriptPath}" "${inputData.replace(/"/g, '\\"')}"`;
      
      try {
        const { stdout, stderr } = await execPromise(command, { 
          cwd: __dirname,
          maxBuffer: 1024 * 1024 * 10, // 10MB buffer
          env: { 
            ...process.env, 
            PYTHONIOENCODING: 'utf-8',
            PYTHONPATH: join(__dirname, '..', 'electron', 'python')
          }
        });

        if (stderr) {
          console.warn(`[Python Warnings] for ${teacherFullName}:`, stderr);
        }

        // Check if stdout is empty
        if (!stdout || stdout.trim() === '') {
          throw new Error('Python script did not return any output');
        }

        // Try to parse the result
        let result;
        try {
          result = JSON.parse(stdout.trim());
        } catch (parseError) {
          console.error('[Python Output] Raw output:', stdout);
          throw new Error(`Failed to parse Python script output: ${parseError.message}\nOutput: ${stdout}`);
        }

        if (!result.success) {
          const errorMsg = result.error || 'Unknown error from Python script';
          const traceback = result.traceback ? `\nPython Traceback:\n${result.traceback}` : '';
          throw new Error(`PDF generation failed: ${errorMsg}${traceback}`);
        }

        if (!result.pdf_buffer) {
          throw new Error('No PDF buffer returned from Python script');
        }

        // Convert base64 to Buffer
        const pdfBuffer = Buffer.from(result.pdf_buffer, 'base64');
        
        if (pdfBuffer.length === 0) {
          throw new Error('Generated PDF buffer is empty');
        }
        
        console.log(`✅ PDF generated successfully for ${teacherFullName} (${pdfBuffer.length} bytes)`);
        
        return pdfBuffer;
        
      } catch (execError) {
        console.error(`[Python Execution Error] for ${teacherFullName}:`, execError);
        
        // Try to read the Python script for debugging
        try {
          const scriptContent = fs.readFileSync(tempScriptPath, 'utf-8');
          console.error('[Python Script] Generated script content:', scriptContent);
        } catch (readError) {
          console.error('Failed to read Python script for debugging:', readError);
        }
        
        throw new Error(`Failed to execute Python script: ${execError.message}`);
      }
      
    } finally {
      // Clean up the temporary script
      try {
        if (existsSync(tempScriptPath)) {
          unlinkSync(tempScriptPath);
        }
      } catch (cleanupError) {
        console.warn(`Failed to cleanup temp script: ${cleanupError.message}`);
      }
    }
    
  } catch (error) {
    console.error(`Error generating PDF for ${teacher?.firstName || 'unknown'} ${teacher?.lastName || 'teacher'}:`, error);
    throw new Error(`PDF generation failed: ${error.message}`);
  }
}

// Helper function to generate PDF
async function generatePdf(teacherData) {
  try {
    console.log('[PDF Generation] Starting PDF generation with data:', JSON.stringify(teacherData, null, 2));
    
    if (!teacherData || typeof teacherData !== 'object') {
      throw new Error('Invalid teacher data provided');
    }
    
    // Ensure we have required teacher data
    const requiredFields = ['id', 'firstName', 'lastName', 'email', 'sessions'];
    const missingFields = requiredFields.filter(field => !(field in teacherData));
    
    if (missingFields.length > 0) {
      throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
    }
    
    // Ensure we have a valid teacher ID (can be string or number)
    const teacherId = String(teacherData.id || '').trim();
    if (!teacherId) {
      throw new Error('Teacher ID is required');
    }
    
    // Ensure we have valid sessions data
    if (!Array.isArray(teacherData.sessions)) {
      throw new Error('Sessions must be an array');
    }
    
    if (teacherData.sessions.length === 0) {
      throw new Error('No sessions found for the teacher');
    }
    
    // Log teacher info for debugging
    console.log(`[PDF Generation] Processing teacher: ${teacherData.firstName} ${teacherData.lastName} (ID: ${teacherId})`);
    console.log(`[PDF Generation] Number of sessions: ${teacherData.sessions.length}`);
    
    // Generate the PDF
    const pdfBuffer = await generateTeacherPDF(teacherData);
    
    if (!(pdfBuffer instanceof Buffer)) {
      throw new Error('Invalid PDF buffer returned from PDF generation');
    }
    
    console.log(`[PDF Generation] Successfully generated PDF for ${teacherData.firstName} ${teacherData.lastName} (${pdfBuffer.length} bytes)`);
    return pdfBuffer;
    
  } catch (error) {
    console.error('[PDF Generation] Error in generatePdf:', error);
    throw new Error(`Failed to generate PDF: ${error.message}`);
  }
}

// Export the functions that need to be used in other files
if (require.main === module) {
  // If the file is being run directly, start the server
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}

// Export functions needed for email and PDF generation
module.exports = {
  sendEmails,
  sendTeacherEmail,
  generatePdf,
  generateTeacherPDF
};
