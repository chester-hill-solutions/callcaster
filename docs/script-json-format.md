# Script JSON Format Documentation

## Overview

This document outlines the structure and format requirements for script JSON files that can be uploaded to the CallCaster platform. Scripts are used to define the flow and content of call campaigns and IVR (Interactive Voice Response) systems.

## Basic Structure

A script JSON file consists of two main components:

1. **Pages**: Sections or screens that organize blocks of content
2. **Blocks**: Individual elements within pages that contain questions, prompts, or other interactive content

Here's the basic structure of a script JSON:

```json
{
  "pages": {
    "page_1": {
      "id": "page_1",
      "title": "Introduction",
      "blocks": ["block_1", "block_2"]
    },
    "page_2": {
      "id": "page_2",
      "title": "Main Questions",
      "blocks": ["block_3", "block_4"]
    }
  },
  "blocks": {
    "block_1": {
      "id": "block_1",
      "type": "textarea",
      "title": "Introduction Script",
      "content": "Hello, my name is [Agent Name]. I'm calling from [Company].",
      "options": [],
      "audioFile": ""
    },
    "block_2": {
      "id": "block_2",
      "type": "select",
      "title": "Initial Response",
      "content": "Is this a good time to talk?",
      "options": [
        {
          "content": "Yes",
          "next": "block_3"
        },
        {
          "content": "No",
          "next": "block_4"
        }
      ],
      "audioFile": ""
    },
    "block_3": {
      "id": "block_3",
      "type": "textarea",
      "title": "Positive Response",
      "content": "Great! Let me tell you about our offer.",
      "options": [],
      "audioFile": ""
    },
    "block_4": {
      "id": "block_4",
      "type": "textarea",
      "title": "Negative Response",
      "content": "I understand. When would be a better time to call back?",
      "options": [],
      "audioFile": ""
    }
  }
}
```

## Detailed Field Descriptions

### Pages

Each page is identified by a unique key (e.g., "page_1") and contains:

| Field | Type | Description | Required |
|-------|------|-------------|----------|
| id | string | Unique identifier for the page | Yes |
| title | string | Title or name of the page/section | Yes |
| blocks | array of strings | Array of block IDs that belong to this page | Yes |

### Blocks

Each block is identified by a unique key (e.g., "block_1") and contains:

| Field | Type | Description | Required |
|-------|------|-------------|----------|
| id | string | Unique identifier for the block | Yes |
| type | string | Type of block (e.g., "textarea", "select", "radio") | Yes |
| title | string | Title or name of the block | Yes |
| content | string | Main content or question text | Yes |
| options | array of objects | Response options (for select/radio types) | Depends on type |
| audioFile | string | Reference to an audio file (if applicable) | No |

### Options (for interactive blocks)

For blocks that require user interaction (like "select" or "radio" types), each option contains:

| Field | Type | Description | Required |
|-------|------|-------------|----------|
| content | string | Text of the option | Yes |
| next | string | ID of the next block to navigate to when this option is selected | Yes |

## Block Types

The following block types are supported:

- **textarea**: A text area for displaying script content or collecting free-form responses
- **select**: A dropdown selection with multiple options
- **radio**: Radio button selection with multiple options
- **checkbox**: Checkbox selection for multiple selections

## Navigation Flow

The navigation flow is determined by the "next" field in each option. This can point to:

- Another block ID (e.g., "block_3")
- "end" to end the script
- A page reference (e.g., "page_2") to jump to another page

## Example Use Cases

### Simple Linear Script

```json
{
  "pages": {
    "page_1": {
      "id": "page_1",
      "title": "Call Script",
      "blocks": ["intro", "question", "closing"]
    }
  },
  "blocks": {
    "intro": {
      "id": "intro",
      "type": "textarea",
      "title": "Introduction",
      "content": "Hello, this is [Name] from [Company].",
      "options": [],
      "audioFile": ""
    },
    "question": {
      "id": "question",
      "type": "textarea",
      "title": "Main Question",
      "content": "Are you interested in learning more about our services?",
      "options": [],
      "audioFile": ""
    },
    "closing": {
      "id": "closing",
      "type": "textarea",
      "title": "Closing",
      "content": "Thank you for your time. Have a great day!",
      "options": [],
      "audioFile": ""
    }
  }
}
```

### Branching Script with Decision Points

```json
{
  "pages": {
    "page_1": {
      "id": "page_1",
      "title": "Initial Contact",
      "blocks": ["greeting", "interest_check"]
    },
    "page_2": {
      "id": "page_2",
      "title": "Interested Path",
      "blocks": ["product_info", "pricing", "closing_positive"]
    },
    "page_3": {
      "id": "page_3",
      "title": "Not Interested Path",
      "blocks": ["objection_handling", "follow_up", "closing_negative"]
    }
  },
  "blocks": {
    "greeting": {
      "id": "greeting",
      "type": "textarea",
      "title": "Greeting",
      "content": "Hello, this is [Name] from [Company]. How are you today?",
      "options": [],
      "audioFile": ""
    },
    "interest_check": {
      "id": "interest_check",
      "type": "select",
      "title": "Interest Check",
      "content": "Are you interested in learning about our new product?",
      "options": [
        {
          "content": "Yes",
          "next": "product_info"
        },
        {
          "content": "No",
          "next": "objection_handling"
        }
      ],
      "audioFile": ""
    },
    "product_info": {
      "id": "product_info",
      "type": "textarea",
      "title": "Product Information",
      "content": "Our product offers the following benefits...",
      "options": [],
      "audioFile": ""
    },
    "pricing": {
      "id": "pricing",
      "type": "textarea",
      "title": "Pricing Information",
      "content": "The pricing starts at $X per month...",
      "options": [],
      "audioFile": ""
    },
    "closing_positive": {
      "id": "closing_positive",
      "type": "textarea",
      "title": "Positive Closing",
      "content": "Thank you for your interest! We'll send you more information by email.",
      "options": [],
      "audioFile": ""
    },
    "objection_handling": {
      "id": "objection_handling",
      "type": "textarea",
      "title": "Objection Handling",
      "content": "I understand. May I ask what concerns you have?",
      "options": [],
      "audioFile": ""
    },
    "follow_up": {
      "id": "follow_up",
      "type": "textarea",
      "title": "Follow Up",
      "content": "Would it be okay if we follow up in a few months?",
      "options": [],
      "audioFile": ""
    },
    "closing_negative": {
      "id": "closing_negative",
      "type": "textarea",
      "title": "Negative Closing",
      "content": "Thank you for your time. Have a great day!",
      "options": [],
      "audioFile": ""
    }
  }
}
```

## Uploading Scripts

To upload a script:

1. Navigate to the "Scripts" section in your workspace
2. Click "New Script"
3. Enter a name for your script
4. Select the script type (IVR or regular script)
5. Upload your JSON file
6. Click "Create"

## Validation Rules

Your script JSON will be validated against these rules:

1. The JSON must be valid and properly formatted
2. All referenced block IDs in page.blocks must exist in the blocks object
3. All "next" values in options must reference valid block IDs or special values like "end"
4. Each page and block must have a unique ID
5. Required fields must be present for each page and block

## Best Practices

1. Use descriptive IDs and titles for pages and blocks
2. Keep content concise and clear
3. Test your script flow before uploading
4. Consider organizing complex scripts into multiple pages for better organization
5. Use consistent naming conventions for IDs (e.g., "page_1", "block_intro") 