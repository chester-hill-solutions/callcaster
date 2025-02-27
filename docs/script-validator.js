/**
 * Script JSON Validator
 * 
 * This script helps validate CallCaster script JSON files before uploading.
 * You can run this in a browser console or using Node.js.
 */

function validateScriptJson(scriptJson) {
  const errors = [];
  const warnings = [];

  // Check if JSON is valid
  let script;
  try {
    if (typeof scriptJson === 'string') {
      script = JSON.parse(scriptJson);
    } else {
      script = scriptJson;
    }
  } catch (e) {
    errors.push('Invalid JSON format: ' + e.message);
    return { isValid: false, errors, warnings };
  }

  // Check for required top-level properties
  if (!script.pages) {
    errors.push('Missing "pages" property');
  }
  if (!script.blocks) {
    errors.push('Missing "blocks" property');
  }

  // If missing required properties, return early
  if (errors.length > 0) {
    return { isValid: false, errors, warnings };
  }

  // Check pages structure
  const pageIds = new Set();
  Object.entries(script.pages).forEach(([pageKey, page]) => {
    if (!page.id) {
      errors.push(`Page "${pageKey}" is missing an "id" property`);
    } else {
      pageIds.add(page.id);
    }
    
    if (!page.title) {
      warnings.push(`Page "${pageKey}" is missing a "title" property`);
    }
    
    if (!Array.isArray(page.blocks)) {
      errors.push(`Page "${pageKey}" has invalid or missing "blocks" array`);
    } else {
      // Check if all block references exist
      page.blocks.forEach(blockId => {
        if (!script.blocks[blockId]) {
          errors.push(`Page "${pageKey}" references non-existent block "${blockId}"`);
        }
      });
    }
  });

  // Check blocks structure
  const blockIds = new Set();
  Object.entries(script.blocks).forEach(([blockKey, block]) => {
    if (!block.id) {
      errors.push(`Block "${blockKey}" is missing an "id" property`);
    } else {
      blockIds.add(block.id);
      
      // Check if block ID matches its key
      if (block.id !== blockKey) {
        warnings.push(`Block ID "${block.id}" doesn't match its key "${blockKey}"`);
      }
    }
    
    if (!block.type) {
      errors.push(`Block "${blockKey}" is missing a "type" property`);
    } else {
      // Validate block type
      const validTypes = ['textarea', 'select', 'radio', 'checkbox'];
      if (!validTypes.includes(block.type)) {
        warnings.push(`Block "${blockKey}" has unknown type "${block.type}"`);
      }
    }
    
    if (!block.title) {
      warnings.push(`Block "${blockKey}" is missing a "title" property`);
    }
    
    if (block.content === undefined) {
      warnings.push(`Block "${blockKey}" is missing a "content" property`);
    }
    
    // Check options for interactive blocks
    if (['select', 'radio', 'checkbox'].includes(block.type)) {
      if (!Array.isArray(block.options)) {
        errors.push(`Interactive block "${blockKey}" has invalid or missing "options" array`);
      } else if (block.options.length === 0) {
        warnings.push(`Interactive block "${blockKey}" has empty "options" array`);
      } else {
        // Check each option
        block.options.forEach((option, index) => {
          if (!option.content) {
            warnings.push(`Option ${index} in block "${blockKey}" is missing "content" property`);
          }
          
          if (!option.next) {
            warnings.push(`Option ${index} in block "${blockKey}" is missing "next" property`);
          } else if (option.next !== 'end' && !script.blocks[option.next]) {
            errors.push(`Option ${index} in block "${blockKey}" references non-existent next block "${option.next}"`);
          }
        });
      }
    }
  });

  // Check for orphaned blocks (blocks not referenced by any page)
  const referencedBlocks = new Set();
  Object.values(script.pages).forEach(page => {
    if (Array.isArray(page.blocks)) {
      page.blocks.forEach(blockId => referencedBlocks.add(blockId));
    }
  });
  
  Object.keys(script.blocks).forEach(blockId => {
    if (!referencedBlocks.has(blockId)) {
      warnings.push(`Block "${blockId}" is not referenced by any page`);
    }
  });

  // Check for circular references
  try {
    checkCircularReferences(script);
  } catch (e) {
    errors.push('Circular reference detected: ' + e.message);
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

function checkCircularReferences(script) {
  const visited = new Set();
  const recursionStack = new Set();
  
  function dfs(blockId) {
    if (blockId === 'end') return;
    if (!script.blocks[blockId]) return;
    
    if (recursionStack.has(blockId)) {
      throw new Error(`Circular path detected involving block "${blockId}"`);
    }
    
    if (visited.has(blockId)) return;
    
    visited.add(blockId);
    recursionStack.add(blockId);
    
    const block = script.blocks[blockId];
    if (Array.isArray(block.options)) {
      block.options.forEach(option => {
        if (option.next) {
          dfs(option.next);
        }
      });
    }
    
    recursionStack.delete(blockId);
  }
  
  // Start DFS from each block
  Object.keys(script.blocks).forEach(blockId => {
    if (!visited.has(blockId)) {
      dfs(blockId);
    }
  });
}

// Example usage
function validateScriptFile(fileContent) {
  const result = validateScriptJson(fileContent);
  
  console.log('Validation Result:', result.isValid ? 'VALID' : 'INVALID');
  
  if (result.errors.length > 0) {
    console.log('Errors:');
    result.errors.forEach(error => console.log(' - ' + error));
  }
  
  if (result.warnings.length > 0) {
    console.log('Warnings:');
    result.warnings.forEach(warning => console.log(' - ' + warning));
  }
  
  return result;
}

// For Node.js usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { validateScriptJson, validateScriptFile };
}

// For browser usage
if (typeof window !== 'undefined') {
  window.validateScriptJson = validateScriptJson;
  window.validateScriptFile = validateScriptFile;
  
  // Add file input handler if in browser
  document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('script-file-input');
    if (fileInput) {
      fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (e) => {
            try {
              const result = validateScriptFile(e.target.result);
              
              // Display results on page if result container exists
              const resultContainer = document.getElementById('validation-result');
              if (resultContainer) {
                resultContainer.innerHTML = `
                  <div class="${result.isValid ? 'success' : 'error'}">
                    <h3>Validation Result: ${result.isValid ? 'VALID' : 'INVALID'}</h3>
                    ${result.errors.length > 0 ? `
                      <div class="error-list">
                        <h4>Errors:</h4>
                        <ul>${result.errors.map(error => `<li>${error}</li>`).join('')}</ul>
                      </div>
                    ` : ''}
                    ${result.warnings.length > 0 ? `
                      <div class="warning-list">
                        <h4>Warnings:</h4>
                        <ul>${result.warnings.map(warning => `<li>${warning}</li>`).join('')}</ul>
                      </div>
                    ` : ''}
                  </div>
                `;
              }
            } catch (error) {
              console.error('Validation error:', error);
            }
          };
          reader.readAsText(file);
        }
      });
    }
  });
} 