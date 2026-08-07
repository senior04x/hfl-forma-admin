using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

namespace AmatoraUploader
{
    class Program
    {
        [STAThread]
        static void Main(string[] args)
        {
            string currentDir = AppDomain.CurrentDomain.BaseDirectory;
            string jsPath = Path.Combine(currentDir, "obs-replay-uploader.js");

            if (!File.Exists(jsPath))
            {
                MessageBox.Show("obs-replay-uploader.js topilmadi!", "AMATORA Uploader", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }

            ProcessStartInfo startInfo = new ProcessStartInfo();
            startInfo.FileName = "cmd.exe";
            startInfo.Arguments = "/k title AMATORA OBS Replay Uploader && color 0A && node \"" + jsPath + "\"";
            startInfo.WorkingDirectory = currentDir;
            startInfo.UseShellExecute = true;

            try
            {
                Process.Start(startInfo);
            }
            catch (Exception ex)
            {
                MessageBox.Show("Dasturni ishga tushirishda xatolik: " + ex.Message, "AMATORA Uploader", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
    }
}
