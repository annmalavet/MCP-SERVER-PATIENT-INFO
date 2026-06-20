import { server } from "./server"
import { z } from "zod"; 
import * as pg from 'pg';
const kReg = Symbol.for("mcp.registered");
const g = globalThis as any;
const registered = (g[kReg] ??= new Set());

const dbConfig = {
      user: process.env.DB_USER ,
      password: process.env.DB_PASS ,
      database: process.env.DB_NAME ,
      host: process.env.DB_HOST ,
      port: parseInt(process.env.DB_PORT || '8080'),
      ssl: { rejectUnauthorized: false },
    };

const searchDBSchema = {
    query: z.string().min(1).describe("The search term to look for in the database."),
};

function registerOnce(name: string, meta: any, handler: any) {
    if (registered.has(name)) return;
    server.registerTool(name, meta, handler);
    registered.add(name);
}

registerOnce(
  'search_for_patient',
  {
    title: 'Search All Patients',
    description: 'Searches the clinic patient database by last name, first name, doctor, date of birth, or email. Returns patient ID, name, date of birth, signed consent status, medications, and diagnosis.',
    inputSchema: searchDBSchema,
  },
  async (params: any) => {
    const pool = new pg.Pool(dbConfig);
    try {
        const query = params.query || '';
      const sql = `
      SELECT * FROM patient_info
      WHERE 
        patient_first_name ILIKE $1 
        OR patient_last_name ILIKE $1 
        OR doctor_last_name ILIKE $1 
        OR patient_birth_day::TEXT ILIKE $1
        OR email ILIKE $1`;

      const values = [`%${query}%`];
      
      const result = await pool.query(sql, values);

      if (result.rows.length === 0) {
        return {
          content: [{ type: 'text', text: 'No results found matching your query for the patient.' }],
        };
      }

      
  const formattedResults = result.rows
    .map((row: { id: any; patient_first_name: any; patient_last_name: any; patient_birth_day: any; signed_consent: any; medications: any; diagnosis: any; email: any; }) => `ID: ${row.id} - Name: ${row.patient_first_name} ${row.patient_last_name} - Email: ${row.email} - Birthday: ${row.patient_birth_day} - Signed Consent: ${row.signed_consent} - Medications: ${row.medications} - Diagnosis: ${row.diagnosis}`)
    .join('\n');

      return {
        content: [{ type: 'text', text: formattedResults }],
      };
    } catch (error: any) {
      console.error('Database error:', error);
      return {
        content: [{ type: 'text', text: `Database error: ${error}` }],
        isError: true,
      };
    }
  }
);

registerOnce(
  'create_new_patient',
  {
    title: 'Create New Patient',
    description: 'Creates a new patient record in the clinic database. Requires first name, last name, doctor last name, and date of birth (YYYY-MM-DD). Optional: signedConsent (boolean) and amountDue.',
    inputSchema: z.object({
      firstName: z.string().describe('Patient first name'),
      lastName: z.string().describe('Patient last name'),
      doctorLastName: z.string().describe('The last name of the doctor'),
      signedConsent: z.boolean().default(false).describe('Has the patient signed consent?'),
      amountDue: z.number().default(0).describe('Amount due in USD'),
      birthDate: z.string().describe('Date of birth in YYYY-MM-DD format'),
    }),
  },
  async (params: any) => {
    const pool = new pg.Pool(dbConfig);
    
    try {
      const { 
        firstName, 
        lastName, 
        doctorLastName, 
        signedConsent, 
        amountDue, 
        birthDate 
      } = params;

      const sql = `
        INSERT INTO patient_info
        (patient_first_name, patient_last_name, doctor_last_name, signed_consent, amount_due, patient_birth_day)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, patient_first_name, patient_last_name;
      `;

      const values = [
        firstName,
        lastName,
        doctorLastName,
        signedConsent, 
        amountDue,    
        birthDate 
      ];
      
      const result = await pool.query(sql, values);

      if (result.rows.length === 0) {
        return {
          content: [{ type: 'text', text: 'Error: Create new patient failed.' }],
          isError: true,
        };
      }

      const newPatient = result.rows[0];
      return {
        content: [{ type: 'text', text: `Success: Created patient ID ${newPatient.id} (${newPatient.patient_first_name} ${newPatient.patient_last_name}).` }],
      };

    } catch (error: any) {
      console.error('Database error:', error);
      return {
        content: [{ type: 'text', text: `Database error: ${error.message}` }],
        isError: true,
      };
    }
  }
);

registerOnce(
  'search_consent_status',
  {
    title: 'Search by Consent',
    description: 'Finds clinic patients by signed consent status (pass "true" or "false"). Returns patient ID, name, and consent status. Use this to audit unsigned consent or confirm signed patients.',
    inputSchema: searchDBSchema,
  },
  async (params: any) => {
    const pool = new pg.Pool(dbConfig);
    try {
      let query = (params.query || '').trim().toLowerCase();

      if (query !== 'true' && query !== 'false') {
        query = 'false';
      }

      const isSigned = query === 'true';

      const sql = `
        SELECT * FROM patient_info
        WHERE signed_consent = $1
      `;
      
      const result = await pool.query(sql, [isSigned]);

      if (result.rows.length === 0) {
        return {
          content: [{ type: 'text', text: `No patients found with consent status: ${query}` }],
        };
      }

      const formattedResults = result.rows
        .map((row: any) => 
            `ID: ${row.id}  Name: ${row.patient_first_name} ${row.patient_last_name} | Consent Signed: ${row.signed_consent}`
        )
        .join('\n');

      return {
        content: [{ type: 'text', text: formattedResults }],
      };

    } catch (error: any) {
      console.error('Database error:', error);
      return {
        content: [{ type: 'text', text: `Database error: ${error.message}` }],
        isError: true,
      };
    }
  }
);

registerOnce(
  'update_patient_info',
  {
    title: 'Update Patient Info',
    description: 'Updates specific fields for a patient by ID',
    inputSchema: z.object({
      patientId: z.number().describe('The unique ID of the patient to update'),
      firstName: z.string().nullable().describe('New first name (or null to keep current)'),
      lastName: z.string().nullable().describe('New last name (or null to keep current)'),
      doctorLastName: z.string().nullable().describe('New doctor last name (or null to keep current)'),
      signedConsent: z.boolean().nullable().describe('New consent status (or null to keep current)'),
      amountDue: z.number().nullable().describe('New amount due (or null to keep current)'),
      birthDate: z.string().nullable().describe('New DOB YYYY-MM-DD (or null to keep current)'),
    }),
  },
  async (params: any) => {
    const pool = new pg.Pool(dbConfig);
    
    try {
      const { patientId, ...updates } = params;

      if (Object.keys(updates).length === 0) {
        return {
          content: [{ type: 'text', text: 'Error: There must be at least one field to change.' }],
          isError: true
        };
      }

      const columnMap: Record<string, string> = {
        firstName: 'patient_first_name',
        lastName: 'patient_last_name',
        doctorLastName: 'doctor_last_name',
        signedConsent: 'signed_consent',
        amountDue: 'amount_due',
        birthDate: 'patient_birth_day'
      };

      const setClauses: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      for (const [key, value] of Object.entries(updates)) {
        if (columnMap[key] && value !== undefined) {
          setClauses.push(`${columnMap[key]} = $${paramIndex}`);
          values.push(value);
          paramIndex++;
        }
      }

      const sql = `
        UPDATE patient_info
        SET ${setClauses.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *;
      `;
      values.push(patientId);

      const result = await pool.query(sql, values);

      if (result.rows.length === 0) {
        return {
          content: [{ type: 'text', text: `Error: Patient ID ${patientId} not found.` }],
          isError: true,
        };
      }

      const updatedRow = result.rows[0];
      return {
        content: [{ type: 'text', text: `Success: Updated patient ID ${patientId}. New State: ${JSON.stringify(updatedRow)}` }],
      };

    } catch (error: any) {
      console.error('Database error:', error);
      return {
        content: [{ type: 'text', text: `Database error: ${error.message}` }],
        isError: true,
      };
    }
  }
);
