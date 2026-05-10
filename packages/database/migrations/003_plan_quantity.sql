ALTER TABLE plans
ADD COLUMN quantity INTEGER;

ALTER TABLE plans
ADD CONSTRAINT plans_quantity_non_negative
CHECK (quantity IS NULL OR quantity >= 0);

