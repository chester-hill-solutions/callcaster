# Template Tags for Message Campaigns

This feature allows you to personalize your SMS messages by inserting contact-specific information using template tags.

## Available Template Tags

The following template tags are available for use in your message campaigns:

| Tag | Description | Example Output |
|-----|-------------|----------------|
| `{{firstname}}` | Contact's first name | "John" |
| `{{surname}}` | Contact's last name | "Doe" |
| `{{fullname}}` | Contact's full name | "John Doe" |
| `{{phone}}` | Contact's phone number | "+1234567890" |
| `{{email}}` | Contact's email address | "john@example.com" |
| `{{address}}` | Contact's street address | "123 Main St" |
| `{{city}}` | Contact's city | "New York" |
| `{{province}}` | Contact's province/state | "NY" |
| `{{postal}}` | Contact's postal code | "10001" |
| `{{country}}` | Contact's country | "USA" |
| `{{external_id}}` | Contact's external ID | "EXT123" |

## Fallbacks: Making Your Messages Robust

You can provide a fallback value for any template tag using the `|` (pipe) character with quotes:

```
{{field_name|"fallback value"}}
```

If the contact field is missing or empty, the fallback value will be used instead.

**Important:** Fallback values must be wrapped in quotes.

### Examples

- `Hi {{firstname|"there"}}, your code is {{external_id|"N/A"}}.`
- `Hello {{fullname|"friend"}}!`
- `Your city: {{city|"Unknown City"}}`

**Result:**
- If the contact's first name is missing, `Hi there, ...`
- If the contact's external ID is missing, `your code is N/A.`
- If the contact's city is missing, `Your city: Unknown City`

## Function-Style Expressions: Combine Tags, Text, and Functions

You can use function-style expressions to combine template tags, text, and functions. For example, you can base64-encode any combination of tags and text using `btoa(...)`:

```
btoa({{phone}}:{{external_id}})
btoa({{phone|"none"}}:{{external_id|"N/A"}})
btoa(Hello {{firstname|"there"}})
```

- Inside the parentheses, you can use any number of `{{field}}` or `{{field|"fallback"}}` tags, as well as arbitrary text.
- The system will first replace all `{{field}}` tags, then apply the function (e.g., `btoa`) to the result.
- You can use multiple function calls in a single message.

### Examples

- `btoa({{email}})` → base64-encoded email
- `btoa({{phone}}:{{external_id}})` → base64-encoded string combining phone and external ID, separated by a colon
- `btoa({{phone|"none"}}:{{external_id|"N/A"}})` → base64-encoded string with fallbacks if fields are missing
- `btoa(Hello {{firstname|"there"}})` → base64-encoded greeting

**Result:**
- If the contact's phone is `5551234` and external ID is `ABC`, `btoa({{phone}}:{{external_id}})` becomes `NTU1MTIzNDpBQkM=`
- If the contact's phone is missing, `btoa({{phone|"none"}}:{{external_id|"N/A"}})` becomes `bm9uZTpBQkM=`

## Encoding: btoa (Base64)

You can encode any template value as base64 using the `btoa` keyword or function:

```
btoa({{field_name}})
btoa({{field_name|"fallback"}})
btoa({{phone}}:{{external_id}})
```

- If the field is present, it will be base64-encoded.
- If the field is missing and a fallback is provided, the fallback will be base64-encoded.
- You can combine multiple tags and text inside the function.

## How to Use Template Tags

1. **In Message Settings**: When composing your campaign message, click the tag icon (📎) next to the text area to open the template tag selector.

2. **Insert Tags**: Click on any template tag to insert it into your message at the current cursor position. You can manually add a fallback, use function calls, or combine tags and text, e.g. `btoa({{firstname|"there"}}:{{external_id}})`.

3. **Preview**: The system will show you which template tags are found in your message below the text area.

4. **Automatic Processing**: When messages are sent, template tags and function calls are automatically processed for each recipient.

## Example Messages

### Personalized Greeting
```
Hi {{firstname|"there"}}, thank you for your interest in our services!
```

### Contact Information
```
Hello {{fullname|"friend"}}, we have an update for your account. Please call us at {{phone|"our main line"}} or email btoa({{email|"support@example.com"}}).
```

### Location-Based Message
```
Hi btoa({{firstname|"there"}}), we have a special offer for customers in {{city|"your area"}}, {{province|"your region"}}!
```

### Combined Example
```
Your encoded info: btoa({{phone}}:{{external_id}})
```

## How It Works

- Template tags and function calls are processed automatically when messages are sent
- Each contact receives a personalized message with their specific data
- If a contact field is empty, the template tag will be replaced with the fallback (if provided) or an empty string
- If `btoa` is specified, the value is base64-encoded
- The system gracefully handles missing contact data

## Technical Details

- Template tags use double curly braces: `{{field_name}}`, `{{field_name|"fallback"}}`, or function calls like `btoa({{field}}:{{other}})`
- Tags are case-sensitive and must match exactly
- Fallback values must be wrapped in quotes
- Processing happens in the SMS handler functions
- Support is available for both campaign messages and individual chat messages
- Template processing is performed server-side for security and reliability
- URLs in messages are automatically shortened for better SMS delivery

## Best Practices

1. **Test Your Messages**: Always test your template tags with sample contact data
2. **Handle Missing Data**: Use fallbacks to ensure your messages always make sense
3. **Use Encoding for Security**: Use `btoa` for values that need to be encoded (e.g., tokens, emails in URLs)
4. **Keep It Personal**: Use first names and other personal data to make messages more engaging
5. **Respect Privacy**: Only use contact data that the recipient has consented to share

## Support

If you encounter any issues with template tags, please check:
- That the template tag syntax is correct (double curly braces, function calls, quoted fallbacks)
- That the contact has the required data fields populated
- That your message campaign is properly configured 