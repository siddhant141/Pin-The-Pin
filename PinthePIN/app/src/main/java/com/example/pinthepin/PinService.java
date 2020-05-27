package com.example.pinthepin;

import android.app.KeyguardManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.net.Uri;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.provider.Settings;
import android.util.Log;
import android.widget.Toast;

import androidx.annotation.Nullable;
import androidx.annotation.RequiresApi;
import androidx.core.app.NotificationCompat;

import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.storage.FirebaseStorage;
import com.google.firebase.storage.StorageReference;
import com.google.firebase.storage.UploadTask;
import com.opencsv.CSVWriter;

import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Date;
import java.util.List;

public class PinService extends Service implements SensorEventListener {

	private SensorManager sensorManager;
	private Sensor senAcc,senGyro,senGrav,senAccwo;

	String baseDir="";
	String fileName;
	String filePath;
	File f;
	CSVWriter writer;
	boolean record=false;

	List<String[]> data_grav = new ArrayList<String[]>();
	List<String[]> data_acc_w = new ArrayList<String[]>();
	List<String[]> data_acc_wo = new ArrayList<String[]>();
	List<String[]> data_gyro = new ArrayList<String[]>();

//	private long stopsaving;
	private long restarttimer;
	boolean filesaved=true;

	FirebaseStorage storage;
	private FirebaseAuth mAuth;
	StorageReference storageRef;

//	boolean flag=true;

	/*@Override
	public void onCreate()
	{
		super.onCreate();
		Log.d("Pinthepin","Timer started onCreate");
		startTimer();
//		Log.d("Pinthepin","created service");
//		if(flag==true)
//			savedata();
//		if (Build.VERSION.SDK_INT > Build.VERSION_CODES.O)
//			startMyOwnForeground();
//		else
//			startForeground(1, new Notification());
	}*/

	@Override
	public int onStartCommand(Intent intent, int flags, int startId) {
		super.onStartCommand(intent, flags, startId);
		Log.d("Pinthepin","Timer started onStartCommand");
//		startTimer();
//		stopsaving =System.currentTimeMillis()+30000;

		restarttimer=System.currentTimeMillis()+120000;

		storage = FirebaseStorage.getInstance();
		storageRef = storage.getReference("Pin");

		//		if(flag==true)
		savedata();
		if (Build.VERSION.SDK_INT > Build.VERSION_CODES.O)
			startMyOwnForeground();
//		else
//			startForeground(1, new Notification());
		return START_STICKY;
	}

	@Override
	public void onDestroy()
	{
		super.onDestroy();
		Log.d("Pinthepin","onDestroy");
		restartservice();
	}

	@RequiresApi(Build.VERSION_CODES.O)
	private void startMyOwnForeground()
	{
		String NOTIFICATION_CHANNEL_ID = "example.pinthepin";
		String channelName = "Background Service";
		NotificationChannel chan = new NotificationChannel(NOTIFICATION_CHANNEL_ID, channelName, NotificationManager.IMPORTANCE_NONE);
		chan.setLightColor(Color.BLUE);
		chan.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);

		NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
		assert manager != null;
		manager.createNotificationChannel(chan);

		NotificationCompat.Builder notificationBuilder = new NotificationCompat.Builder(this, NOTIFICATION_CHANNEL_ID);
		Notification notification = notificationBuilder.setOngoing(true)
//				.setSmallIcon(R.mipmap.ic_launcher)
				.setContentTitle("App is running in background")
				.setPriority(NotificationManager.IMPORTANCE_MAX)
				.setCategory(Notification.CATEGORY_SERVICE)
				.build();
		startForeground(2, notification);
	}

	public void restartservice()
	{
		sensorManager.unregisterListener(this,senAcc);
		sensorManager.unregisterListener(this,senAccwo);
		sensorManager.unregisterListener(this,senGyro);
		sensorManager.unregisterListener(this,senGrav);
		Log.d("Pinthepin","Unregistered listener");
		Log.d("Pinthepin","Sending broadcast");
		Intent broadcastIntent = new Intent();
		broadcastIntent.setAction("ServiceRestart");
		broadcastIntent.setClass(this, ServiceRestart.class);
		this.sendBroadcast(broadcastIntent);
	}

	@Nullable
	@Override
	public IBinder onBind(Intent intent) {
		return null;
	}

	private void savedata() {
//		flag=false;
		baseDir = getExternalFilesDir(null)+File.separator+"Pin";

		File createFolder=new File(baseDir + File.separator + "Acc_w");
		if(!createFolder.mkdirs())
			Log.d("Pinthepin","Already there Acc_w");
		createFolder=new File(baseDir + File.separator + "Acc_wo");
		if(!createFolder.mkdirs())
			Log.d("Pinthepin","Already there Acc_wo");
		createFolder=new File(baseDir + File.separator + "Gyro");
		if(!createFolder.mkdirs())
			Log.d("Pinthepin","Already there Gyro");
		createFolder=new File(baseDir + File.separator + "Grav");
		if(!createFolder.mkdirs())
			Log.d("Pinthepin","Already there Grav");

		Log.d("Pinthepin","Folders created");

		data_acc_wo.clear();
		data_acc_w.clear();
		data_gyro.clear();
		data_grav.clear();

		Log.d("Pinthepin","Data cleared");

		data_grav.add(new String[] {"Time","X","Y","Z"});
		data_gyro.add(new String[] {"Time","X","Y","Z"});
		data_acc_w.add(new String[] {"Time","X","Y","Z"});
		data_acc_wo.add(new String[] {"Time","X","Y","Z"});

		Log.d("Pinthepin","Data initialized");

		record=false;

		sensorManager = (SensorManager) getSystemService(Context.SENSOR_SERVICE);
		senAcc = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
		sensorManager.registerListener(this,senAcc,SensorManager.SENSOR_DELAY_FASTEST);

		senGyro = sensorManager.getDefaultSensor(Sensor.TYPE_GYROSCOPE);
		sensorManager.registerListener(this,senGyro,SensorManager.SENSOR_DELAY_FASTEST);

		senGrav = sensorManager.getDefaultSensor(Sensor.TYPE_GRAVITY);
		sensorManager.registerListener(this, senGrav ,SensorManager.SENSOR_DELAY_FASTEST);

		senAccwo = sensorManager.getDefaultSensor(Sensor.TYPE_LINEAR_ACCELERATION);
		sensorManager.registerListener(this, senAccwo ,SensorManager.SENSOR_DELAY_FASTEST);
	}

	@RequiresApi(api = Build.VERSION_CODES.KITKAT_WATCH)
	@Override
	public void onSensorChanged(SensorEvent event) {
		Sensor mySensor = event.sensor;

		if(System.currentTimeMillis()>=restarttimer)
		{
			restartservice();
		}

		KeyguardManager myKM = (KeyguardManager) this.getSystemService(Context.KEYGUARD_SERVICE);
		boolean isPhoneLocked = myKM.inKeyguardRestrictedInputMode();

		PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
		boolean isScreenOn = pm.isInteractive();

		if(isScreenOn && isPhoneLocked)
		{
			filesaved=false;
			record=true;
		}

		if(!isPhoneLocked)
		{
			record=false;
			if(filesaved==false)
			{
				savefile();
				filesaved=true;
			}

		}

		/*if(!isScreenOn)
		{
			if(record==true)
			{
				Log.d("Pinthepin","Screen off");
				record=false;
			}
			filesaved=false;
			stopsaving =System.currentTimeMillis()+30000;
		}
		else
		{
			if(record==false && filesaved==false)
			{
				Log.d("Pinthepin","Screen on");
				record=true;
			}
		}*/

//		Log.d("Pinthepin","Getting data");

		if (mySensor.getType() == Sensor.TYPE_ACCELEROMETER) {
			float x = event.values[0];
			float y = event.values[1];
			float z = event.values[2];

			Long sub=System.currentTimeMillis();

			String X=Float.toString(x);
			String Y=Float.toString(y);
			String Z=Float.toString(z);

			if(record == true)
			{
				/*if(System.currentTimeMillis() >= stopsaving)
				{
					Log.d("Pinthepin","In conditions");
					record=false;
					filesaved=true;
					savefile();
				}*/
				data_acc_w.add(new String[] {Long.toString(sub),X,Y,Z});
			}

		}

		else if (mySensor.getType() == Sensor.TYPE_LINEAR_ACCELERATION) {
			float x = event.values[0];
			float y = event.values[1];
			float z = event.values[2];

			Long sub=System.currentTimeMillis();

			String X=Float.toString(x);
			String Y=Float.toString(y);
			String Z=Float.toString(z);

			if(record == true)
			{
				data_acc_wo.add(new String[] {Long.toString(sub),X,Y,Z});
			}

		}

		else if (mySensor.getType() == Sensor.TYPE_GYROSCOPE) {
			float x = event.values[0];
			float y = event.values[1];
			float z = event.values[2];

			Long sub=System.currentTimeMillis();

			String X=Float.toString(x);
			String Y=Float.toString(y);
			String Z=Float.toString(z);

			if(record == true)
			{
				data_gyro.add(new String[] {Long.toString(sub),X,Y,Z});
			}
		}

		else if (mySensor.getType() == Sensor.TYPE_GRAVITY) {
			float x = event.values[0];
			float y = event.values[1];
			float z = event.values[2];

			Long sub=System.currentTimeMillis();

			String X=Float.toString(x);
			String Y=Float.toString(y);
			String Z=Float.toString(z);

			if(record == true)
			{
				data_grav.add(new String[] {Long.toString(sub),X,Y,Z});
			}
		}
	}

	@Override
	public void onAccuracyChanged(Sensor sensor, int accuracy) {

	}

	void savefile()
	{
		record=false;
		/*sensorManager.unregisterListener(this,senAcc);
		sensorManager.unregisterListener(this,senAccwo);
		sensorManager.unregisterListener(this,senGyro);
		sensorManager.unregisterListener(this,senGrav);
		Log.d("Pinthepin","Unregistered listener");*/
		//Acc_w
		SimpleDateFormat format=new SimpleDateFormat("dd-MM-yyyy hh:mm:ss a");
		Date today= Calendar.getInstance().getTime();
		String id= Settings.Secure.getString(getContentResolver(), Settings.Secure.ANDROID_ID).substring(12);
		fileName= id+format.format(today).replaceAll(" ","_")+".csv";
		filePath = baseDir + File.separator +"Acc_w" + File.separator + fileName;
		f = new File(filePath);
		try {
			f.createNewFile();
		} catch (IOException e) {
			e.printStackTrace();
			Log.println(Log.INFO,"Pinthepin","unable to create file");
		}
//			Log.println(Log.INFO,"Train","file name : "+filePath);
		try {
			writer = new CSVWriter(new FileWriter(filePath));
			writer.writeAll(data_acc_w);
			writer.close();
			Log.d("Pinthepin","Wrote Acc_w : "+data_acc_w.size());
		} catch (IOException e) {
			e.printStackTrace();
//			Toast.makeText(getBaseContext(),"File nai bani",Toast.LENGTH_LONG).show();
		}

		//Acc_wo
		filePath = baseDir + File.separator +"Acc_wo" + File.separator + fileName;
		f = new File(filePath);
		try {
			f.createNewFile();
		} catch (IOException e) {
			e.printStackTrace();
			Log.println(Log.INFO,"Pinthepin","unable to create file");
		}
		try {
			writer = new CSVWriter(new FileWriter(filePath));
			writer.writeAll(data_acc_wo);
			writer.close();
			Log.d("Pinthepin","Wrote Acc_wo : "+data_acc_wo.size());
		} catch (IOException e) {
			e.printStackTrace();
//			Toast.makeText(getBaseContext(),"File nai bani",Toast.LENGTH_LONG).show();
		}

		//Gyro
		filePath = baseDir + File.separator +"Gyro" + File.separator + fileName;
		f = new File(filePath);
		try {
			f.createNewFile();
		} catch (IOException e) {
			e.printStackTrace();
			Log.println(Log.INFO,"Pinthepin","unable to create file");
		}
		try {
			writer = new CSVWriter(new FileWriter(filePath));
			writer.writeAll(data_gyro);
			writer.close();
			Log.d("Pinthepin","Wrote Gyro : "+data_gyro.size());
		} catch (IOException e) {
			e.printStackTrace();
//			Toast.makeText(getBaseContext(),"File nai bani",Toast.LENGTH_LONG).show();
		}

		//Grav
		filePath = baseDir + File.separator +"Grav" + File.separator + fileName;
		f = new File(filePath);
		try {
			f.createNewFile();
		} catch (IOException e) {
			e.printStackTrace();
			Log.println(Log.INFO,"Pinthepin","unable to create file");
		}
		try {
			writer = new CSVWriter(new FileWriter(filePath));
			writer.writeAll(data_grav);
			writer.close();
			Log.d("Pinthepin","Wrote Grav : "+data_grav.size());
		} catch (IOException e) {
			e.printStackTrace();
//			Toast.makeText(getBaseContext(),"File nai bani",Toast.LENGTH_LONG).show();
		}

//		Uri file = Uri.fromFile(new File("path/to/images/rivers.jpg"));
		Uri Acc_wfile = Uri.fromFile(new File(baseDir + File.separator +"Acc_w" + File.separator + fileName));
		Uri Acc_wofile = Uri.fromFile(new File(baseDir + File.separator +"Acc_wo" + File.separator + fileName));
		Uri Gravfile = Uri.fromFile(new File(baseDir + File.separator +"Grav" + File.separator + fileName));
		Uri Gyrofile = Uri.fromFile(new File(baseDir + File.separator +"Gyro" + File.separator + fileName));

		StorageReference PinRefAcc_w = storageRef.child("Acc_w/"+Acc_wfile.getLastPathSegment());
		StorageReference PinRefAcc_wo = storageRef.child("Acc_wo/"+Acc_wofile.getLastPathSegment());
		StorageReference PinRefGrav = storageRef.child("Grav/"+Gravfile.getLastPathSegment());
		StorageReference PinRefGyro = storageRef.child("Gyro/"+Gyrofile.getLastPathSegment());

		UploadTask uploadTaskAcc_w = PinRefAcc_w.putFile(Acc_wfile);
		UploadTask uploadTaskAcc_wo = PinRefAcc_wo.putFile(Acc_wofile);
		UploadTask uploadTaskGrav = PinRefGrav.putFile(Gravfile);
		UploadTask uploadTaskGyro = PinRefGyro.putFile(Gyrofile);

// Register observers to listen for when the download is done or if it fails
		uploadTaskAcc_w.addOnFailureListener(exception -> {
			// Handle unsuccessful uploads
		}).addOnSuccessListener(taskSnapshot -> {
			// taskSnapshot.getMetadata() contains file metadata such as size, content-type, etc.
			// ...
			Log.d("Pinthepin","Acc_w uploaded");
//			Toast.makeText(getBaseContext(),"Acc_w uploaded",Toast.LENGTH_SHORT).show();
		});

		uploadTaskAcc_wo.addOnFailureListener(exception -> {
			// Handle unsuccessful uploads
		}).addOnSuccessListener(taskSnapshot -> {
			// taskSnapshot.getMetadata() contains file metadata such as size, content-type, etc.
			// ...
			Log.d("Pinthepin","Acc_wo uploaded");
//			Toast.makeText(getBaseContext(),"Acc_wo uploaded",Toast.LENGTH_SHORT).show();
		});

		uploadTaskGrav.addOnFailureListener(exception -> {
			// Handle unsuccessful uploads
		}).addOnSuccessListener(taskSnapshot -> {
			// taskSnapshot.getMetadata() contains file metadata such as size, content-type, etc.
			// ...
			Log.d("Pinthepin","Grav uploaded");
//			Toast.makeText(getBaseContext(),"Grav uploaded",Toast.LENGTH_SHORT).show();
		});

		uploadTaskGyro.addOnFailureListener(exception -> {
			// Handle unsuccessful uploads
		}).addOnSuccessListener(taskSnapshot -> {
			// taskSnapshot.getMetadata() contains file metadata such as size, content-type, etc.
			// ...
			Log.d("Pinthepin","Gyro uploaded");
//			Toast.makeText(getBaseContext(),"Gyro uploaded",Toast.LENGTH_SHORT).show();
		});

		data_acc_wo.clear();
		data_acc_w.clear();
		data_gyro.clear();
		data_grav.clear();

		Log.d("Pinthepin","Data cleared");

		data_grav.add(new String[] {"Time","X","Y","Z"});
		data_gyro.add(new String[] {"Time","X","Y","Z"});
		data_acc_w.add(new String[] {"Time","X","Y","Z"});
		data_acc_wo.add(new String[] {"Time","X","Y","Z"});

		Log.d("Pinthepin","Data initialized");

//		restartservice();
	}
}
