// Simulated storage in memory
const storage = {
    chunks: new Map(),
    files: new Map(),
    
    // Store a chunk
    storeChunk(fileName, chunkIndex, chunkData) {
        if (!this.chunks.has(fileName)) {
            this.chunks.set(fileName, new Map());
        }
        this.chunks.get(fileName).set(chunkIndex, chunkData);
    },
    
    // Check if all chunks are present
    hasAllChunks(fileName, totalChunks) {
        const fileChunks = this.chunks.get(fileName);
        if (!fileChunks) return false;
        
        for (let i = 0; i < totalChunks; i++) {
            if (!fileChunks.has(i)) return false;
        }
        return true;
    },
    
    // Combine chunks into a complete file
    combineChunks(fileName, totalChunks) {
        const fileChunks = this.chunks.get(fileName);
        if (!fileChunks) return null;
        
        const chunks = [];
        for (let i = 0; i < totalChunks; i++) {
            chunks.push(fileChunks.get(i));
        }
        
        // Combine chunks into a single Blob
        const completeFile = new Blob(chunks, { type: 'application/octet-stream' });
        this.files.set(fileName, completeFile);
        
        // Clean up chunks
        this.chunks.delete(fileName);
        
        return completeFile;
    },
    
    // Get stored file
    getFile(fileName) {
        return this.files.get(fileName);
    },
    
    // List all stored files
    listFiles() {
        return Array.from(this.files.keys());
    }
};

class FileUploader {
    constructor() {
        this.chunkSize = 1024 * 1024; // 1MB chunks
        this.files = new Map(); // Map to store file upload states
        this.uploadInProgress = false;
        this.uploadPaused = false;

        this.initializeElements();
        this.initializeEventListeners();
        this.updateStorageDisplay();
    }

    initializeElements() {
        this.dropZone = document.getElementById('dropZone');
        this.fileInput = document.getElementById('fileInput');
        this.folderInput = document.getElementById('folderInput');
        this.browseFilesButton = document.getElementById('browseFilesButton');
        this.browseFoldersButton = document.getElementById('browseFoldersButton');
        this.uploadButton = document.getElementById('uploadButton');
        this.progressContainer = document.getElementById('progressContainer');
        this.progressBar = document.getElementById('progressBar');
        this.uploadStatus = document.getElementById('uploadStatus');
        this.storageContents = document.getElementById('storageContents');
        this.filesList = document.getElementById('filesList');
    }

    initializeEventListeners() {
        // Remove the drop zone click handler that triggers file input
        this.dropZone.addEventListener('click', (e) => {
            // Only trigger if clicking directly on the drop zone, not on buttons
            if (e.target === this.dropZone) {
                this.fileInput.click();
            }
        });

        this.browseFilesButton.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent triggering dropZone click
            this.fileInput.click();
        });

        this.browseFoldersButton.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent triggering dropZone click
            this.folderInput.click();
        });

        this.dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.dropZone.classList.add('dragover');
        });

        this.dropZone.addEventListener('dragleave', () => {
            this.dropZone.classList.remove('dragover');
        });

        this.dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            this.dropZone.classList.remove('dragover');
            const items = e.dataTransfer.items;
            if (items) {
                this.handleItems(items);
            } else {
                const files = e.dataTransfer.files;
                if (files) {
                    this.handleFiles(files);
                }
            }
        });

        this.fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.handleFiles(e.target.files);
            }
        });

        this.folderInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.handleFiles(e.target.files);
            }
        });

        this.uploadButton.addEventListener('click', () => this.startUpload());
    }

    async handleItems(items) {
        const entries = [];
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.kind === 'file') {
                const entry = item.webkitGetAsEntry();
                if (entry) {
                    entries.push(entry);
                }
            }
        }
        await this.processEntries(entries);
    }

    async processEntries(entries) {
        for (const entry of entries) {
            if (entry.isFile) {
                const file = await this.getFileFromEntry(entry);
                if (file) {
                    // Preserve the full path in the file name
                    const fullPath = entry.fullPath || entry.name;
                    file.fullPath = fullPath;
                    this.addFile(file);
                }
            } else if (entry.isDirectory) {
                const dirReader = entry.createReader();
                const entries = await new Promise((resolve) => {
                    dirReader.readEntries((entries) => resolve(entries));
                });
                await this.processEntries(entries);
            }
        }
    }

    getFileFromEntry(entry) {
        return new Promise((resolve) => {
            entry.file((file) => {
                resolve(file);
            }, (error) => {
                console.error('Error getting file from entry:', error);
                resolve(null);
            });
        });
    }

    async handleFiles(fileList) {
        const files = Array.from(fileList);
        for (const file of files) {
            // For files selected through the folder input
            if (file.webkitRelativePath) {
                file.fullPath = file.webkitRelativePath;
            }
            this.addFile(file);
        }
    }

    addFile(file) {
        // Use fullPath if available, otherwise use file name
        const fileKey = file.fullPath || file.name;
        
        if (this.files.has(fileKey)) {
            return; // Skip if file already exists
        }

        const fileState = {
            file,
            uploadedChunks: new Set(),
            currentChunk: 0,
            totalChunks: Math.ceil(file.size / this.chunkSize),
            status: 'pending',
            element: this.createFileElement(file)
        };

        this.files.set(fileKey, fileState);
        this.filesList.appendChild(fileState.element);
        this.uploadButton.disabled = false;
    }

    createFileElement(file) {
        const div = document.createElement('div');
        div.className = 'file-item';
        const displayName = file.fullPath || file.name;
        div.innerHTML = `
            <div class="file-item-header">
                <span class="file-name">${displayName}</span>
                <span class="file-size">${this.formatFileSize(file.size)}</span>
            </div>
            <div class="file-progress">
                <div class="progress-bar">
                    <div class="progress" style="width: 0%"></div>
                </div>
            </div>
            <div class="file-status">Ready to upload</div>
            <div class="chunk-info">
                <div class="chunk-progress">
                    <span class="chunk-size">Chunk Size: ${this.formatFileSize(this.chunkSize)}</span>
                    <span class="chunk-count">Chunks: 0 / ${Math.ceil(file.size / this.chunkSize)}</span>
                </div>
            </div>
        `;
        return div;
    }

    async startUpload() {
        if (this.uploadInProgress) {
            this.uploadPaused = true;
            this.uploadButton.textContent = 'Resume Upload';
            return;
        }

        this.uploadInProgress = true;
        this.uploadPaused = false;
        this.uploadButton.textContent = 'Pause Upload';
        this.progressContainer.style.display = 'block';

        for (const [fileName, fileState] of this.files) {
            if (fileState.status === 'pending' || fileState.status === 'paused') {
                await this.uploadFile(fileName, fileState);
            }
        }

        this.uploadInProgress = false;
        this.uploadButton.textContent = 'Upload Complete';
        this.uploadButton.disabled = true;
    }

    async uploadFile(fileName, fileState) {
        fileState.status = 'uploading';
        const element = fileState.element;
        const progressBar = element.querySelector('.progress');
        const statusElement = element.querySelector('.file-status');
        const chunkCountElement = element.querySelector('.chunk-count');

        while (fileState.currentChunk < fileState.totalChunks && !this.uploadPaused) {
            if (!fileState.uploadedChunks.has(fileState.currentChunk)) {
                await this.uploadChunk(fileName, fileState);
            }
            fileState.currentChunk++;
        }

        if (fileState.currentChunk === fileState.totalChunks) {
            fileState.status = 'completed';
            element.classList.add('completed');
            statusElement.textContent = 'Upload completed';
        } else if (this.uploadPaused) {
            fileState.status = 'paused';
            statusElement.textContent = 'Upload paused';
        }
    }

    async uploadChunk(fileName, fileState) {
        const start = fileState.currentChunk * this.chunkSize;
        const end = Math.min(start + this.chunkSize, fileState.file.size);
        const chunk = fileState.file.slice(start, end);

        try {
            // Simulate network delay
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Store the chunk in our simulated storage
            storage.storeChunk(fileName, fileState.currentChunk, chunk);
            
            // Check if this was the last chunk
            if (fileState.currentChunk === fileState.totalChunks - 1) {
                const completeFile = storage.combineChunks(fileName, fileState.totalChunks);
                if (completeFile) {
                    this.updateStorageDisplay();
                }
            }

            fileState.uploadedChunks.add(fileState.currentChunk);
            this.updateFileProgress(fileName, fileState);
        } catch (error) {
            console.error('Error uploading chunk:', error);
            fileState.element.classList.add('error');
            fileState.element.querySelector('.file-status').textContent = 'Error uploading chunk. Retrying...';
            await new Promise(resolve => setTimeout(resolve, 1000));
            return this.uploadChunk(fileName, fileState); // Retry the same chunk
        }
    }

    updateFileProgress(fileName, fileState) {
        const element = fileState.element;
        const progress = (fileState.uploadedChunks.size / fileState.totalChunks) * 100;
        element.querySelector('.progress').style.width = `${progress}%`;
        element.querySelector('.file-status').textContent = `Uploading... ${Math.round(progress)}%`;
        element.querySelector('.chunk-count').textContent = 
            `Chunks: ${fileState.uploadedChunks.size} / ${fileState.totalChunks}`;
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    updateStorageDisplay() {
        const files = storage.listFiles();
        this.storageContents.innerHTML = files.length > 0 
            ? files.map(file => `<div>${file} (${this.formatFileSize(storage.getFile(file).size)})</div>`).join('')
            : '<div>No files stored</div>';
    }
}

// Initialize the uploader when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new FileUploader();
}); 