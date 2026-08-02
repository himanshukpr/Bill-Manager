UPDATE bills SET to_date = CONCAT(DATE(to_date), ' 23:59:59.999');
SELECT id, to_date FROM bills LIMIT 5;
SELECT COUNT(*) AS total FROM bills;
