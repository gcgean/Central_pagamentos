-- =============================================================================
-- Seed de desenvolvimento
-- =============================================================================

-- Admin super
INSERT INTO admins (id, name, email, password_hash, role) VALUES
    ('00000000-0000-0000-0000-000000000001', 'Admin Master', 'admin@hub.local',
     -- senha: hub@2025 (bcrypt)
     '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TioRpFQ5X1n6h6d5K5k3l3bKsP5i',
     'super_admin');

-- Produtos
INSERT INTO products (id, code, name, description, billing_type, status) VALUES
    ('10000000-0000-0000-0000-000000000001', 'erp_clinico',   'Sistema Clínico',    'ERP para clínicas médicas',       'recurring', 'active'),
    ('10000000-0000-0000-0000-000000000002', 'pdv_retail',    'Sistema PDV',        'Ponto de venda para varejo',       'recurring', 'active'),
    ('10000000-0000-0000-0000-000000000003', 'erp_financeiro','ERP Financeiro',     'Módulo financeiro integrado',      'recurring', 'active'),
    ('10000000-0000-0000-0000-000000000004', 'relatorios',    'Sistema Relatórios', 'Relatórios e dashboards avançados','one_time',  'active');

-- Planos do Sistema Clínico
INSERT INTO plans (id, product_id, code, name, amount, interval_unit, interval_count, max_users, trial_days, status) VALUES
    ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'clinico_start',  'Starter',     9900,  'month', 1, 3,  14, 'active'),
    ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'clinico_pro',    'Pro',         19900, 'month', 1, 10, 14, 'active'),
    ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'clinico_pro_an', 'Pro Anual',   189000,'year',  1, 10, 14, 'active');

-- Planos do PDV
INSERT INTO plans (id, product_id, code, name, amount, interval_unit, interval_count, max_users, status) VALUES
    ('20000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000002', 'pdv_mensal', 'Mensal', 14900, 'month', 1, 5, 'active'),
    ('20000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000002', 'pdv_anual',  'Anual',  149000,'year',  1, 5, 'active');

-- Plano do Relatórios (compra única)
INSERT INTO plans (id, product_id, code, name, amount, interval_unit, interval_count, allow_installments, max_installments, status) VALUES
    ('20000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000004', 'relatorios_unico', 'Licença Vitalícia', 49900, 'lifetime', 1, TRUE, 6, 'active');

-- Clientes de exemplo
INSERT INTO customers (id, person_type, document, document_clean, legal_name, trade_name, email, phone) VALUES
    ('30000000-0000-0000-0000-000000000001', 'PJ', '12.345.678/0001-90', '12345678000190', 'Clínica Saúde Ltda', 'Clínica Saúde', 'contato@clinicasaude.com.br', '(85) 99999-0001'),
    ('30000000-0000-0000-0000-000000000002', 'PF', '123.456.789-09',     '12345678909',   'João da Silva', NULL, 'joao@gmail.com', '(85) 98888-0002');
