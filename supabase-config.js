// Conexión a Supabase.
// La anonKey es pública a propósito: la seguridad la dan las reglas de la base (supabase/esquema.sql),
// que solo dejan modificar equipos al usuario admin.
const IVORYX_SUPABASE = {
  url: 'https://pvbrvvshxlernwggwewh.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB2YnJ2dnNoeGxlcm53Z2d3ZXdoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIwODk1NDEsImV4cCI6MjEwNzY2NTU0MX0.xmiSCJTXdMJ9vtI0S-uC8kH7H7mPef0tGGBUReUm9xs',
  // Usuario del admin. En el admin solo se escribe la contraseña.
  adminEmail: 'admin@ivoryx.store'
};
