# [Service Name] Service

- **General Description**: [Brief description of the business responsibility of this Service]
- **Accessed Database Tables**:
  - `table_name_1`
  - `table_name_2`

---

## List of Methods

### 1. [Method 1 Name, e.g., getFinanceSummary]

- **Task Description**: [Detailed description of the business logic handled by the method]
- **Accessed Tables**: `transactions`, `bank_accounts` (Read)
- **AI Tool Integration**: (Leave empty if not a tool)
  - **Tool Name**: `get_finance_summary`
  - **Tool Description**: `Retrieves an overall financial fluctuation report (income, expenses, balance) by time period.`
  - **Parameters Schema**:
    - `period` (`string`, required, enum: `['day', 'week', 'month', 'year']`): Reporting period to retrieve.
    - `month` (`number`, optional): Month to query (1-12).
    - `year` (`number`, optional): Year to query.

#### Input / Output

- **Input**:
  - `query`: `FinanceSummaryQueryDto` - [Description of DTO containing query parameters]

- **Output**:
  - `Promise<FinanceSummaryResponseDto>`: [Overview report of spending/income]

---

### 2. [Method 2 Name, e.g., calculateTax]

- **Task Description**: [Tax calculation - Internal processing, not exposed to AI Agent]
- **Accessed Tables**: No DB access
- **AI Tool Integration**:
  - **Is AI Tool**: `No`

#### Input / Output

- **Input**:
  - `amount` (`number`): [Base amount]
  - `taxRate` (`number`): [Tax rate]

- **Output**:
  - `number`: [Calculated tax amount]
