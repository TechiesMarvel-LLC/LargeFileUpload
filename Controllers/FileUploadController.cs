using Microsoft.AspNetCore.Mvc;
using System.IO;

namespace FileUploadAPI.Controllers;

[ApiController]
[Route("api/[controller]")]
public class FileUploadController : ControllerBase
{
    private readonly IWebHostEnvironment _environment;
    private readonly ILogger<FileUploadController> _logger;

    public FileUploadController(IWebHostEnvironment environment, ILogger<FileUploadController> logger)
    {
        _environment = environment;
        _logger = logger;
    }

    [HttpPost("chunk")]
    public async Task<IActionResult> UploadChunk([FromForm] IFormFile chunk, [FromForm] string fileName, [FromForm] int chunkIndex, [FromForm] int totalChunks)
    {
        try
        {
            if (chunk == null || chunk.Length == 0)
            {
                return BadRequest(new { success = false, message = "No file uploaded" });
            }

            // Create uploads directory if it doesn't exist
            var uploadsDir = Path.Combine(_environment.ContentRootPath, "uploads");
            if (!Directory.Exists(uploadsDir))
            {
                Directory.CreateDirectory(uploadsDir);
            }

            // Create a session directory with current date and time
            var sessionDir = Path.Combine(uploadsDir, $"upload_{DateTime.Now:yyyyMMdd_HHmmss}");
            if (!Directory.Exists(sessionDir))
            {
                Directory.CreateDirectory(sessionDir);
            }

            // Create a temporary directory for chunks
            var chunkDir = Path.Combine(sessionDir, $"{fileName}_chunks");
            if (!Directory.Exists(chunkDir))
            {
                Directory.CreateDirectory(chunkDir);
            }

            // Save the chunk
            var chunkPath = Path.Combine(chunkDir, chunkIndex.ToString());
            using (var stream = new FileStream(chunkPath, FileMode.Create))
            {
                await chunk.CopyToAsync(stream);
            }

            // Check if all chunks are uploaded
            var uploadedChunks = Directory.GetFiles(chunkDir).Length;
            
            if (uploadedChunks == totalChunks)
            {
                // Combine chunks
                var finalPath = Path.Combine(sessionDir, fileName);
                using (var output = new FileStream(finalPath, FileMode.Create))
                {
                    for (int i = 0; i < totalChunks; i++)
                    {
                        var chunkFile = Path.Combine(chunkDir, i.ToString());
                        using (var input = new FileStream(chunkFile, FileMode.Open))
                        {
                            await input.CopyToAsync(output);
                        }
                        System.IO.File.Delete(chunkFile);
                    }
                }
                Directory.Delete(chunkDir);

                return Ok(new { 
                    success = true, 
                    message = "File upload complete",
                    filePath = $"/uploads/{Path.GetFileName(sessionDir)}/{fileName}"
                });
            }

            return Ok(new { 
                success = true, 
                message = "Chunk uploaded successfully",
                uploadedChunks = uploadedChunks,
                totalChunks = totalChunks
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error uploading chunk");
            return BadRequest(new { success = false, message = ex.Message });
        }
    }

    [HttpGet("files")]
    public IActionResult GetFiles()
    {
        try
        {
            var uploadsDir = Path.Combine(_environment.ContentRootPath, "uploads");
            if (!Directory.Exists(uploadsDir))
            {
                return Ok(new List<object>());
            }

            var files = new List<object>();
            foreach (var sessionDir in Directory.GetDirectories(uploadsDir))
            {
                foreach (var file in Directory.GetFiles(sessionDir))
                {
                    if (!file.Contains("_chunks"))
                    {
                        var fileInfo = new FileInfo(file);
                        files.Add(new
                        {
                            name = Path.GetFileName(file),
                            size = fileInfo.Length,
                            path = $"/uploads/{Path.GetFileName(sessionDir)}/{Path.GetFileName(file)}"
                        });
                    }
                }
            }

            return Ok(files);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting files");
            return BadRequest(new { success = false, message = ex.Message });
        }
    }
} 