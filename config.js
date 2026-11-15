// Configuração do app de Metas. Usa o MESMO Supabase do Portal (lojas e logins), com as tabelas metas_*.
// A chave "anon" pode ficar no site: a segurança é feita pelo banco (regras de acesso).
// Abrir com ?demo no endereço liga o MODO DEMONSTRAÇÃO (dados de exemplo só no aparelho).
window.CONFIG = {
  supabaseUrl: "https://miqmwjxdmulgtwqhtdqp.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pcW13anhkbXVsZ3R3cWh0ZHFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ2MTE2MzcsImV4cCI6MjExMDE4NzYzN30.ejKrB3WAO8vmIM2YsSDXXh01_qxeocSRS8I9qxNjZcY",
  dominioLogin: "pedidos.cellstore.local",
  vapidPublica: "BMDdzNpPF_t-Mzu6qJ8TqAL361psQS38RZOHkdfqSy6hy7aMSrUExa1NE3siuXXXQ-G_jvB4zKjZNdgcSK3BpEc"
};
