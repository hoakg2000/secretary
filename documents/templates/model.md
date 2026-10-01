# Document Name: [Entity Name] Model

**Document ID:** [DOC-MOD-0001]
**Document Type:** Models
**Description:** [Short description of the database table, common model, or shared object]

## Changelog

| Date       | Version | Author      | Description of Changes |
| :--------- | :------ | :---------- | :--------------------- |
| YYYY-MM-DD | 1.0.0   | [Your Name] | Initial creation       |

## Service Dependencies

- **Service Document ID:** [N/A or DOC-SVC-0001]
- **Service Description:** [N/A or Database schema registry]
- **Usage:** [N/A or "Used across the order management service for state persistence."]

## Model Definition

- **Table/Collection Name:** `[database_table_name]`
- **Primary Key:** `[id]`

### Properties (Key-Value Definitions)

| Key Name    | Data Type | Constraints / Relations      | Description                           |
| :---------- | :-------- | :--------------------------- | :------------------------------------ |
| `id`        | UUID      | PK, Auto-generated, Not Null | Unique identifier for the record      |
| `status`    | Enum      | Default: 'PENDING'           | Current lifecycle state of the entity |
| `createdAt` | Timestamp | Auto-generated, Not Null     | Record creation timestamp             |
| `userId`    | UUID      | FK -> `users.id`, Indexed    | Reference to the owner of this record |
