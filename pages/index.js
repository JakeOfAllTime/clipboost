export default function Home() {
  return (
    <div>
      <input type="file" id="clipUpload" multiple />
      <button onClick={uploadClips}>Upload</button>
    </div>
  );
}

async function uploadClips() {
  const files = document.getElementById('clipUpload').files;
  const formData = new FormData();
  for (let file of files) {
    formData.append('clipUpload', file);
  }
  const response = await fetch('/api/upload', { method: 'POST', body: formData });
  console.log(await response.json());
}