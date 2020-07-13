# Pin-the-PIN
Final year B-Tech project. This will enable us to crack the pattern lock on android phones using accelerometer and gyroscope sensors.

## Report
The complete report and presentation is included in the folder "Final Submission/".

## Related work
The folder "Research Papers/" contains the file:
- Mehrnexhad...
- latest research

These both are the pdf files that contains the related work in this topic.

## GyroAccData
This is an Android application which shows live graph of the sensor data (Accelerometer with gravity and gyroscope sensor types).

## Train
App that is used to collect training data from the users and the model is trained using this data.

## Pin the PIN
Android application which runs in the background to save the data from the sensors when the phone is being unlocked using PIN of any length and uploads these data to Google firebase storage for remote access.

## Pattern Cracking
Folder contains the jupyter notebook files that we need to pre-process the data from the sensors and keep it as input to the machine learning model. The models used are from sci-kit learn and Keras library. The models too are stored in this folder. Refer the report for any details of processed data and models. The files stored in this folder are used only for experimenting and testing purpose and does not have the final code for the actual processing of the maliciously extracted phone data.

## Phone Testing
It contains the files used for final processing and loading the saved trained models to predict the PINs.

## Site
It is a trial on how the extraction of data works on website. There is problem that needs to be solved i.e. background data collection.

## crackit
An incomplete app made using flutter so that one development can be used for both Android and iOS.
