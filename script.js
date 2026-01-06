document.addEventListener('DOMContentLoaded', () => {
    console.log('ImageReducto v2.0 - Auto-Downscaling Active');
    const themeToggle = document.getElementById('theme-toggle');
    const htmlElement = document.documentElement;

    // Check for saved theme preference or use system preference
    const savedTheme = localStorage.getItem('theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    if (savedTheme) {
        htmlElement.setAttribute('data-theme', savedTheme);
    } else if (systemPrefersDark) {
        htmlElement.setAttribute('data-theme', 'dark');
    }

    // Toggle Theme
    themeToggle.addEventListener('click', () => {
        const currentTheme = htmlElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

        htmlElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
    });

    // Drag & Drop Logic
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('file-input');
    const previewContainer = document.getElementById('preview-container');

    // Toggle drag active state
    ['dragenter', 'dragover'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.add('drag-active');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.remove('drag-active');
        }, false);
    });

    // Handle File Drop
    dropzone.addEventListener('drop', (e) => {
        const files = e.dataTransfer.files;
        handleFiles(files);
    });

    // Handle Click
    dropzone.addEventListener('click', () => {
        fileInput.click();
    });

    // Handle Input Change
    fileInput.addEventListener('change', (e) => {
        handleFiles(e.target.files);
    });

    // State
    let currentFile = null;
    let compressedBlob = null;

    // elements
    const settingsPanel = document.getElementById('settings-panel');
    const targetSizeInput = document.getElementById('target-size');
    const qualitySlider = document.getElementById('quality-slider');
    const qualityValue = document.getElementById('quality-value');
    const originalSizeEl = document.getElementById('original-size');
    const compressedSizeEl = document.getElementById('compressed-size');
    const compressBtn = document.getElementById('compress-btn');
    const downloadBtn = document.getElementById('download-btn');

    // UI Listeners
    qualitySlider.addEventListener('input', (e) => {
        qualityValue.textContent = `${e.target.value}%`;
        // Clear target size if slider is moved manually
        if (targetSizeInput.value) targetSizeInput.value = '';
    });

    targetSizeInput.addEventListener('input', () => {
        // Optional: Provide feedback or disable slider
    });

    compressBtn.addEventListener('click', () => {
        if (currentFile) processCompression(currentFile);
    });

    downloadBtn.addEventListener('click', () => {
        if (compressedBlob) {
            const url = URL.createObjectURL(compressedBlob);
            const a = document.createElement('a');
            a.href = url;
            // Ensure correct extension
            const originalName = currentFile.name.substring(0, currentFile.name.lastIndexOf('.'));
            a.download = `compressed-${originalName}.jpg`;
            a.click();
            URL.revokeObjectURL(url);
        }
    });

    function handleFiles(files) {
        if (!files.length) return;

        const file = files[0]; // Handle single file for now
        if (!file.type.startsWith('image/')) {
            alert('Only image files are allowed!');
            return;
        }

        currentFile = file;
        originalSizeEl.textContent = formatBytes(file.size);
        compressedSizeEl.textContent = '-';
        downloadBtn.disabled = true;
        settingsPanel.classList.remove('hidden'); // Show settings

        addFilePreview(file);
    }

    function addFilePreview(file) {
        previewContainer.innerHTML = ''; // Clear previous
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onloadend = () => {
            const div = document.createElement('div');
            div.className = 'preview-card';
            div.innerHTML = `
                <img src="${reader.result}" alt="${file.name}">
                <small>${file.name}</small>
            `;
            previewContainer.appendChild(div);
        };
    }

    async function processCompression(file) {
        compressBtn.textContent = 'Compressing...';
        compressBtn.disabled = true;

        try {
            const targetKB = parseFloat(targetSizeInput.value);
            const useTargetSize = !isNaN(targetKB) && targetKB > 0;

            console.log(`Starting compression. Target KB: ${targetKB}, Use Target: ${useTargetSize}`);

            if (useTargetSize) {
                // Binary Search for Quality
                compressedBlob = await compressToTargetSize(file, targetKB * 1024);
            } else {
                // Manual Quality
                const quality = parseInt(qualitySlider.value) / 100;
                compressedBlob = await compressImageValid(file, quality);
            }

            // Update UI
            compressedSizeEl.textContent = formatBytes(compressedBlob.size);
            downloadBtn.disabled = false;
        } catch (error) {
            console.error(error);
            alert('Compression failed.');
        } finally {
            compressBtn.textContent = 'Compress';
            compressBtn.disabled = false;
        }
    }

    async function compressToTargetSize(file, maxBytes) {
        let min = 0.01;
        let max = 1.0;
        let bestBlob = null;
        let scale = 1.0; // Start at full resolution

        // 1. Try adjusting quality first (Binary Search)
        for (let i = 0; i < 6; i++) {
            const mid = (min + max) / 2;
            const blob = await compressImageValid(file, mid, scale);

            console.log(`Quality Search ${i}: Q=${mid.toFixed(2)} -> Size ${blob.size}`);

            if (blob.size <= maxBytes) {
                bestBlob = blob;
                min = mid;
            } else {
                max = mid;
            }
        }

        // 2. If even lowest quality is too big, start Downscaling
        let currentBlob = bestBlob || await compressImageValid(file, 0.01, scale);

        while (currentBlob.size > maxBytes && scale > 0.1) {
            scale -= 0.1; // Reduce size by 10% each step
            console.log(`Downscaling: Scale=${scale.toFixed(1)}`);
            currentBlob = await compressImageValid(file, 0.5, scale); // Reset quality to mid-range for resized image
        }

        return currentBlob;
    }

    function compressImageValid(file, quality, scale = 1.0) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.src = URL.createObjectURL(file);
            img.onload = () => {
                const canvas = document.createElement('canvas');
                // Apply scaling
                canvas.width = img.width * scale;
                canvas.height = img.height * scale;

                const ctx = canvas.getContext('2d');

                // Draw white background
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                // Draw image with scaling
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                // Force image/jpeg to ensure compression quality works
                canvas.toBlob((blob) => {
                    resolve(blob);
                }, 'image/jpeg', quality);
            };
            img.onerror = reject;
        });
    }

    function formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    // Register Service Worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js')
            .then((reg) => console.log('Service Worker Registered', reg))
            .catch((err) => console.log('Service Worker Registration Failed', err));
    }
});
