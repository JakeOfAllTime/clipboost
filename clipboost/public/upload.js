async function uploadClips() {
  const files = document.getElementById('clipUpload').files;
  const storage = firebase.storage();
  for (let file of files) {
    const ref = storage.ref(`clips/${file.name}`);
    await ref.put(file);
    console.log(`${file.name} uploaded!`);
  }
}