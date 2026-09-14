const fs = require('fs');
const path = require('path');

// Component directories to update
const componentDirs = [
  'Keyword',
  'Topic', 
  'Publisher',
  'DataType',
  'Country',
  'Item',
  'CoordinateReferenceSystem',
  'Metadata'
];

// File patterns to update
const filePatterns = [
  'Actions.jsx',
  'CreateDialog.jsx', 
  'UpdateDialog.jsx'
];

// Import replacements
const importReplacements = {
  'import { toast } from \'sonner\'': 'import { handleCreate, handleUpdate, handleDelete, handleFetch } from \'@/lib/apiUtils\'',
  'import { toast } from "sonner"': 'import { handleCreate, handleUpdate, handleDelete, handleFetch } from "@/lib/apiUtils"'
};

// Function to update a file
function updateFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    let updated = false;

    // Update imports
    for (const [oldImport, newImport] of Object.entries(importReplacements)) {
      if (content.includes(oldImport)) {
        content = content.replace(oldImport, newImport);
        updated = true;
        //console.log(`Updated imports in ${filePath}`);
      }
    }

    // Update fetch operations
    const fetchPattern = /apiService\.request\(`([^`]+)`\)\s*\.then\(async \(res\) => \{\s*const data = await res\.json\(\)\s*if \(data\.status === 'success'\) \{\s*([^}]+)\s*\} else \{\s*([^}]+)\s*\}\s*\}\)\s*\.catch\(\(\) => ([^)]+)\)\s*\.finally\(\(\) => ([^)]+)\)/gs;
    
    if (fetchPattern.test(content)) {
      content = content.replace(fetchPattern, (match, url, successCode, errorCode, catchCode, finallyCode) => {
        return `handleFetch(
        () => apiService.request(\`${url}\`),
        'Failed to load data'
      ).then((result) => {
        if (result.success) {
          ${successCode.trim()}
        } else {
          ${errorCode.trim()}
        }
      }).finally(() => ${finallyCode.trim()})`;
      });
      updated = true;
      //console.log(`Updated fetch operations in ${filePath}`);
    }

    // Update create operations
    const createPattern = /const response = await apiService\.request\('([^']+)', \{\s*method: 'POST',\s*body: JSON\.stringify\(([^)]+)\)\s*\}\)\s*const responseData = await response\.json\(\)\s*if \(responseData\.status === 'success'\) \{\s*([^}]+)\s*\} else \{\s*([^}]+)\s*\}\s*\} catch \(error\) \{\s*([^}]+)\s*\} finally \{\s*([^}]+)\s*\}/gs;
    
    if (createPattern.test(content)) {
      content = content.replace(createPattern, (match, url, data, successCode, errorCode, catchCode, finallyCode) => {
        return `const result = await handleCreate(
      () => apiService.request('${url}', {
        method: 'POST',
        body: JSON.stringify(${data})
      }),
      'Item created successfully',
      'Failed to create item'
    )
    
    if (result.success) {
      ${successCode.trim()}
    }
    
    ${finallyCode.trim()}`;
      });
      updated = true;
      //console.log(`Updated create operations in ${filePath}`);
    }

    // Update update operations
    const updatePattern = /const response = await apiService\.request\(`([^`]+)`, \{\s*method: 'PUT',\s*body: JSON\.stringify\(([^)]+)\)\s*\}\)\s*const responseData = await response\.json\(\)\s*if \(responseData\.status === 'success'\) \{\s*([^}]+)\s*\} else \{\s*([^}]+)\s*\}\s*\} catch \(error\) \{\s*([^}]+)\s*\} finally \{\s*([^}]+)\s*\}/gs;
    
    if (updatePattern.test(content)) {
      content = content.replace(updatePattern, (match, url, data, successCode, errorCode, catchCode, finallyCode) => {
        return `const result = await handleUpdate(
      () => apiService.request(\`${url}\`, {
        method: 'PUT',
        body: JSON.stringify(${data})
      }),
      'Item updated successfully',
      'Failed to update item'
    )
    
    if (result.success) {
      ${successCode.trim()}
    }
    
    ${finallyCode.trim()}`;
      });
      updated = true;
      //console.log(`Updated update operations in ${filePath}`);
    }

    // Update delete operations
    const deletePattern = /const response = await apiService\.request\(`([^`]+)`, \{\s*method: 'DELETE'\s*\}\)\s*const responseData = await response\.json\(\)\s*if \(response\.status === 200\) \{\s*([^}]+)\s*\} else \{\s*([^}]+)\s*\}\s*\} catch \(error\) \{\s*([^}]+)\s*\} finally \{\s*([^}]+)\s*\}/gs;
    
    if (deletePattern.test(content)) {
      content = content.replace(deletePattern, (match, url, successCode, errorCode, catchCode, finallyCode) => {
        return `const result = await handleDelete(
      () => apiService.request(\`${url}\`, { method: 'DELETE' }),
      'Item deleted successfully',
      'Failed to delete item'
    )
    
    if (result.success) {
      ${successCode.trim()}
    }
    
    ${finallyCode.trim()}`;
      });
      updated = true;
      //console.log(`Updated delete operations in ${filePath}`);
    }

    if (updated) {
      fs.writeFileSync(filePath, content, 'utf8');
      //console.log(`✅ Updated ${filePath}`);
    } else {
      //console.log(`⏭️  No changes needed for ${filePath}`);
    }

  } catch (error) {
    console.error(`❌ Error updating ${filePath}:`, error.message);
  }
}

// Main function
function main() {
  const componentsDir = path.join(__dirname, 'src', 'components');
  
  //console.log('🔄 Starting error handling updates...\n');
  
  for (const dir of componentDirs) {
    const dirPath = path.join(componentsDir, dir);
    
    if (!fs.existsSync(dirPath)) {
      //console.log(`⚠️  Directory not found: ${dirPath}`);
      continue;
    }
    
    //console.log(`📁 Processing ${dir} components...`);
    
    for (const pattern of filePatterns) {
      const files = fs.readdirSync(dirPath).filter(file => file.includes(pattern));
      
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        updateFile(filePath);
      }
    }
    
    //console.log('');
  }
  
  //console.log('✅ Error handling updates completed!');
  //console.log('\n📝 Note: You may need to manually review and adjust some files');
  //console.log('   - Check for any remaining toast.error() calls');
  //console.log('   - Verify function names match (e.g., handleDelete vs handleDeleteItem)');
  //console.log('   - Test the updated components to ensure they work correctly');
}

main();
