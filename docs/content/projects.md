# Projects, autosave and .cdz files

## Where your work is stored

A project is stored in this browser's private storage for the site (the origin private file system). Nothing is uploaded, there is no account, and the app sets no cookies and sends no telemetry.

Every change is saved as you make it. If the tab or browser closes, opening the app again reopens the project you were working on.

The home screen lists the projects stored in this browser. Delete a project there to remove it from the device.

## Working offline

After the first visit the app works without a connection. The header says **Ready offline for images** once the app itself is saved in the browser, and **Ready offline** once PDF support is saved too, which happens the first time you open a PDF.

## Saving a .cdz file

Choose **Save .cdz** in the sidebar, or press Ctrl+S, to download the project as a single `.cdz` file. Keep it as a backup, move it to another computer, or send it to a colleague.

When the project has PDFs, you can save the **Project only** (small; the crops and points are kept, the PDFs are not) or the **Project with its PDFs** (larger; anyone can re-render crops).

## Opening a .cdz file

Open or drop a `.cdz` file like any other file. If a project with the same identity is already in this browser, the file opens as a copy named "(copy)", so nothing is overwritten.

A project saved without its PDFs still opens and exports. To re-render a crop, open the same PDF again: it is recognised by its contents and re-attached.

## Clearing site data

Clearing this site's data in the browser settings deletes every stored project. Save a `.cdz` first for anything you want to keep.

## Reporting a problem

When something goes wrong, the error message offers **Report…** (a failed trace offers **Report this error…**, and a crash shows **Report this error…** next to **Reload**). It opens a report for you to read first: the error, the app version, your browser and what you were doing (screen, guide step, tool and tab, no names).

Nothing is sent. **Open GitHub issue** opens a new issue on GitHub with the report filled in, which you can edit and submit yourself; **Copy report** copies the text to paste anywhere else.

Tick **Include the project, anonymized** to add the project's points, calibration, fits and settings, which usually make a bug reproducible. Names, axis labels, notes, references and file names are replaced and images are never included. A large project does not fit in a link; the issue then asks you to paste it from **Copy report**.
