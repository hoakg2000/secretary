# Document Name: [3rd Party Service Name] Integration API

**Document ID:** [DOC-API-EXT-0001]
**Document Type:** 3rd-Party API
**Description:** [Short description of the external API and why the project integrates with it]

## Changelog

| Date       | Version | Author      | Description of Changes |
| :--------- | :------ | :---------- | :--------------------- |
| YYYY-MM-DD | 1.0.0   | [Your Name] | Initial creation       |

## Service Dependencies

- **Service Document ID:** [DOC-SVC-EXT-0001]
- **Service Description:** [3rd Party Service Provider Name]
- **Usage:** [Sentence explaining how it is used, e.g., "Processes secure payment transactions via the external payment gateway."]

## API Specifications

- **Base URL:** `https://api.external-provider.com/v1`
- **Endpoint:** `/charges`
- **Method:** `POST`
- **Authentication:** `[e.g., API Key in Header]`

### Input Model (Mapped Request DTO)

| Field Name | Type    | Validation Rule                      | Required | Description          |
| :--------- | :------ | :----------------------------------- | :------- | :------------------- |
| `amount`   | Decimal | Greater than 0, Max 2 decimal places | Yes      | Transaction amount   |
| `currency` | String  | Valid ISO 4217 currency code         | Yes      | Transaction currency |

### Output Model (Mapped Response DTO)

| Field Name      | Type    | Description                    |
| :-------------- | :------ | :----------------------------- |
| `transactionId` | String  | Provider's unique reference ID |
| `isAuthorized`  | Boolean | Authorization status           |

### Related Models

- **[Model Name]**: Refer to `[DOC-MOD-0002]` for internal transaction logging representation.
