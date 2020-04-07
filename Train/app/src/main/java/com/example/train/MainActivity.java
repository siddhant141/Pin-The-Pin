package com.example.train;

import androidx.appcompat.app.AppCompatActivity;
import androidx.constraintlayout.widget.ConstraintLayout;
import androidx.constraintlayout.widget.Constraints;

import android.content.Context;
import android.graphics.Color;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Bundle;
import android.os.Handler;
import android.provider.Settings;
import android.util.Log;
import android.view.MotionEvent;
import android.widget.Button;
import android.widget.TextView;
import android.widget.Toast;

import com.opencsv.CSVWriter;

import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Date;
import java.util.List;
import java.util.Random;

public class MainActivity extends AppCompatActivity implements SensorEventListener{

	private SensorManager sensorManager;
	private Sensor senAcc,senGyro,senGrav,senAccwo;

	String baseDir="";
	String fileName;
	String filePath;
	File f;
	CSVWriter writer;
	boolean record=false;

	ConstraintLayout layout;

	Long start_time;
//	Long press_time;
	Long key_down= Long.valueOf(0);
	Long key_up= Long.valueOf(0);

	Button startButton;
	Button stopButton;
	Button b1,b2,b3,b4,b5,b6,b7,b8,b9,b0;
	TextView tv,counttv;

	List<String[]> data_grav = new ArrayList<String[]>();
	List<String[]> data_acc_w = new ArrayList<String[]>();
	List<String[]> data_acc_wo = new ArrayList<String[]>();
	List<String[]> data_gyro = new ArrayList<String[]>();

	int []a;
	int count;

	@Override
	protected void onCreate(Bundle savedInstanceState) {
		super.onCreate(savedInstanceState);
		setContentView(R.layout.activity_main);

		startButton = findViewById(R.id.start_button);
		stopButton = findViewById(R.id.stop_button);
		b1 = findViewById(R.id.b1);
		b2 = findViewById(R.id.b2);
		b3 = findViewById(R.id.b3);
		b4 = findViewById(R.id.b4);
		b5 = findViewById(R.id.b5);
		b6 = findViewById(R.id.b6);
		b7 = findViewById(R.id.b7);
		b8 = findViewById(R.id.b8);
		b9 = findViewById(R.id.b9);
		b0 = findViewById(R.id.b0);
		tv = findViewById(R.id.display_key);
        counttv = findViewById(R.id.count);
		layout = findViewById(R.id.layout);

		disable();
		tv.setText("Press any key");
		tv.setBackgroundColor(Color.GRAY);

		layout.setBackgroundColor(Color.BLACK);

		setlistener();

		baseDir = getExternalFilesDir(null)+File.separator+"Train";

		File createFolder=new File(baseDir + File.separator + "Acc_w");
		if(!createFolder.mkdirs())
			Log.d("Train","Acc_w");
		createFolder=new File(baseDir + File.separator + "Acc_wo");
		if(!createFolder.mkdirs())
			Log.d("Train","Acc_wo");
		createFolder=new File(baseDir + File.separator + "Gyro");
		if(!createFolder.mkdirs())
			Log.d("Train","Gyro");
		createFolder=new File(baseDir + File.separator + "Grav");
		if(!createFolder.mkdirs())
			Log.d("Train","Grav");

		startButton.setEnabled(true);
		stopButton.setEnabled(false);

		sensorManager = (SensorManager) getSystemService(Context.SENSOR_SERVICE);
		senAcc = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
		sensorManager.registerListener(this,senAcc,SensorManager.SENSOR_DELAY_FASTEST);

		senGyro = sensorManager.getDefaultSensor(Sensor.TYPE_GYROSCOPE);
		sensorManager.registerListener(this,senGyro,SensorManager.SENSOR_DELAY_FASTEST);

		senGrav = sensorManager.getDefaultSensor(Sensor.TYPE_GRAVITY);
		sensorManager.registerListener(this, senGrav ,SensorManager.SENSOR_DELAY_FASTEST);

		senAccwo = sensorManager.getDefaultSensor(Sensor.TYPE_LINEAR_ACCELERATION);
		sensorManager.registerListener(this, senAccwo ,SensorManager.SENSOR_DELAY_FASTEST);

		startButton.setOnClickListener(view -> {

			record = true;
			startButton.setEnabled(false);
			stopButton.setEnabled(true);

			enable();

			start_time=System.currentTimeMillis();

			data_grav.add(new String[] {"Time","X","Y","Z"});
			data_gyro.add(new String[] {"Time","X","Y","Z"});
			data_acc_w.add(new String[] {"Time","X","Y","Z"});
			data_acc_wo.add(new String[] {"Time","X","Y","Z"});

			count=40;
			Random random=new Random();
			a=new int[10];
			tv.setText("Press "+ random.nextInt(10) + "\nor go nuts");
		});

		stopButton.setOnClickListener(view -> {
			disable();

			data_acc_wo.clear();
			data_acc_w.clear();
			data_gyro.clear();
			data_grav.clear();
			startButton.setEnabled(true);
			stopButton.setEnabled(false);
			record=false;
			layout.setBackgroundColor(Color.BLACK);
			tv.setText("Press any key");
			counttv.setText("40 left");
		});
	}

	void down()
	{
		key_down=System.currentTimeMillis();
		layout.setBackgroundColor(Color.RED);
	}

	void up(String lastch)
	{
		disable();

		key_up=System.currentTimeMillis();
		count--;

		new Handler().postDelayed(() -> {
			saveFile(lastch);
		},1000);

		new Handler().postDelayed(() -> {
			enable();

			layout.setBackgroundColor(Color.GREEN);
			Random random=new Random();
			int temp=random.nextInt(10);
			int flag=0;
			for(int i=0;i<10;i++)
			{
				if(a[i]<4)
				{
					flag=1;
					break;
				}
			}
			if(flag==1)
			{
				while(true)
				{
					if(a[temp]<4)
						break;
					else
						temp=(temp+1)%10;
				}
				tv.setText("Press "+ temp + "\nor go nuts");
			}
			else
			{
				disable();
				tv.setText("Press Stop");
			}
			counttv.setText(count+" left");
		},1000);
	}

	void saveFile(String lastch)
	{
		record=false;
		key_down-=start_time;
		key_up-=start_time;

		//Acc_w
		SimpleDateFormat format=new SimpleDateFormat("dd-MM-yyyy hh:mm:ss a");
		Date today= Calendar.getInstance().getTime();
		String id= Settings.Secure.getString(getContentResolver(), Settings.Secure.ANDROID_ID).substring(12);
		fileName= id+format.format(today).replaceAll(" ","_")+lastch+key_down+"&"+key_up+".csv";
		filePath = baseDir + File.separator +"Acc_w" + File.separator + fileName;
		f = new File(filePath);
		try {
			f.createNewFile();
		} catch (IOException e) {
			e.printStackTrace();
			Log.println(Log.INFO,"Train","unable to create file");
		}
//			Log.println(Log.INFO,"Train","file name : "+filePath);
		try {
			writer = new CSVWriter(new FileWriter(filePath));
			writer.writeAll(data_acc_w);
			writer.close();
		} catch (IOException e) {
			e.printStackTrace();
			Toast.makeText(getBaseContext(),"File nai bani",Toast.LENGTH_LONG).show();
		}

		//Acc_wo
		filePath = baseDir + File.separator +"Acc_wo" + File.separator + fileName;
		f = new File(filePath);
		try {
			f.createNewFile();
		} catch (IOException e) {
			e.printStackTrace();
			Log.println(Log.INFO,"Train","unable to create file");
		}
		try {
			writer = new CSVWriter(new FileWriter(filePath));
			writer.writeAll(data_acc_wo);
			writer.close();
		} catch (IOException e) {
			e.printStackTrace();
			Toast.makeText(getBaseContext(),"File nai bani",Toast.LENGTH_LONG).show();
		}

		//Gyro
		filePath = baseDir + File.separator +"Gyro" + File.separator + fileName;
		f = new File(filePath);
		try {
			f.createNewFile();
		} catch (IOException e) {
			e.printStackTrace();
			Log.println(Log.INFO,"Train","unable to create file");
		}
		try {
			writer = new CSVWriter(new FileWriter(filePath));
			writer.writeAll(data_gyro);
			writer.close();
		} catch (IOException e) {
			e.printStackTrace();
			Toast.makeText(getBaseContext(),"File nai bani",Toast.LENGTH_LONG).show();
		}

		//Grav
		filePath = baseDir + File.separator +"Grav" + File.separator + fileName;
		f = new File(filePath);
		try {
			f.createNewFile();
		} catch (IOException e) {
			e.printStackTrace();
			Log.println(Log.INFO,"Train","unable to create file");
		}
		try {
			writer = new CSVWriter(new FileWriter(filePath));
			writer.writeAll(data_grav);
			writer.close();
		} catch (IOException e) {
			e.printStackTrace();
			Toast.makeText(getBaseContext(),"File nai bani",Toast.LENGTH_LONG).show();
		}

		data_acc_wo.clear();
		data_acc_w.clear();
		data_gyro.clear();
		data_grav.clear();

		data_grav.add(new String[] {"Time","X","Y","Z"});
		data_gyro.add(new String[] {"Time","X","Y","Z"});
		data_acc_w.add(new String[] {"Time","X","Y","Z"});
		data_acc_wo.add(new String[] {"Time","X","Y","Z"});

		start_time=System.currentTimeMillis();
		record=true;
	}

	@Override
	public void onSensorChanged(SensorEvent sensorEvent) {
		Sensor mySensor = sensorEvent.sensor;

		if (mySensor.getType() == Sensor.TYPE_ACCELEROMETER) {
			float x = sensorEvent.values[0];
			float y = sensorEvent.values[1];
			float z = sensorEvent.values[2];

			Long sub=System.currentTimeMillis();

			String X=Float.toString(x);
			String Y=Float.toString(y);
			String Z=Float.toString(z);

			if(record == true)
			{
				data_acc_w.add(new String[] {Long.toString(sub-start_time),X,Y,Z});
			}

		}

		else if (mySensor.getType() == Sensor.TYPE_LINEAR_ACCELERATION) {
			float x = sensorEvent.values[0];
			float y = sensorEvent.values[1];
			float z = sensorEvent.values[2];

			Long sub=System.currentTimeMillis();

			String X=Float.toString(x);
			String Y=Float.toString(y);
			String Z=Float.toString(z);

			if(record == true)
			{
				data_acc_wo.add(new String[] {Long.toString(sub-start_time),X,Y,Z});
			}

		}

		else if (mySensor.getType() == Sensor.TYPE_GYROSCOPE) {
			float x = sensorEvent.values[0];
			float y = sensorEvent.values[1];
			float z = sensorEvent.values[2];

			Long sub=System.currentTimeMillis();

			String X=Float.toString(x);
			String Y=Float.toString(y);
			String Z=Float.toString(z);

			if(record == true)
			{
				data_gyro.add(new String[] {Long.toString(sub-start_time),X,Y,Z});
			}
		}

		else if (mySensor.getType() == Sensor.TYPE_GRAVITY) {
			float x = sensorEvent.values[0];
			float y = sensorEvent.values[1];
			float z = sensorEvent.values[2];

			Long sub=System.currentTimeMillis();

			String X=Float.toString(x);
			String Y=Float.toString(y);
			String Z=Float.toString(z);

			if(record == true)
			{
				data_grav.add(new String[] {Long.toString(sub-start_time),X,Y,Z});
			}
		}
	}

	@Override
	public void onAccuracyChanged(Sensor sensor, int i) {

	}

	void setlistener()
	{
		b1.setOnTouchListener((v, event) -> {
			switch(event.getAction())
			{
				case MotionEvent.ACTION_DOWN:
					down();
					a[1]++;
					break;
				case MotionEvent.ACTION_UP:
					up("1");
					break;
			}

			return true;
		});
		b2.setOnTouchListener((v, event) -> {
			switch(event.getAction())
			{
				case MotionEvent.ACTION_DOWN:
					down();
					a[2]++;
					break;
				case MotionEvent.ACTION_UP:
					up("2");
					break;
			}

			return true;
		});
		b3.setOnTouchListener((v, event) -> {
			switch(event.getAction())
			{
				case MotionEvent.ACTION_DOWN:
					down();
					a[3]++;
					break;
				case MotionEvent.ACTION_UP:
					up("3");
					break;
			}

			return true;
		});
		b4.setOnTouchListener((v, event) -> {
			switch(event.getAction())
			{
				case MotionEvent.ACTION_DOWN:
					down();
					a[4]++;
					break;
				case MotionEvent.ACTION_UP:
					up("4");
					break;
			}

			return true;
		});
		b5.setOnTouchListener((v, event) -> {
			switch(event.getAction())
			{
				case MotionEvent.ACTION_DOWN:
					down();
					a[5]++;
					break;
				case MotionEvent.ACTION_UP:
					up("5");
					break;
			}

			return true;
		});
		b6.setOnTouchListener((v, event) -> {
			switch(event.getAction())
			{
				case MotionEvent.ACTION_DOWN:
					down();
					a[6]++;
					break;
				case MotionEvent.ACTION_UP:
					up("6");
					break;
			}

			return true;
		});
		b7.setOnTouchListener((v, event) -> {
			switch(event.getAction())
			{
				case MotionEvent.ACTION_DOWN:
					down();
					a[7]++;
					break;
				case MotionEvent.ACTION_UP:
					up("7");
					break;
			}

			return true;
		});
		b8.setOnTouchListener((v, event) -> {
			switch(event.getAction())
			{
				case MotionEvent.ACTION_DOWN:
					down();
					a[8]++;
					break;
				case MotionEvent.ACTION_UP:
					up("8");
					break;
			}

			return true;
		});
		b9.setOnTouchListener((v, event) -> {
			switch(event.getAction())
			{
				case MotionEvent.ACTION_DOWN:
					down();
					a[9]++;
					break;
				case MotionEvent.ACTION_UP:
					up("9");
					break;
			}

			return true;
		});
		b0.setOnTouchListener((v, event) -> {
			switch(event.getAction())
			{
				case MotionEvent.ACTION_DOWN:
					down();
					a[0]++;
					break;
				case MotionEvent.ACTION_UP:
					up("0");
					break;
			}
			return true;
		});
	}

	void disable()
    {
        b1.setEnabled(false);
        b2.setEnabled(false);
        b3.setEnabled(false);
        b4.setEnabled(false);
        b5.setEnabled(false);
        b6.setEnabled(false);
        b7.setEnabled(false);
        b8.setEnabled(false);
        b9.setEnabled(false);
        b0.setEnabled(false);
    }

    void enable()
    {
        b1.setEnabled(true);
        b2.setEnabled(true);
        b3.setEnabled(true);
        b4.setEnabled(true);
        b5.setEnabled(true);
        b6.setEnabled(true);
        b7.setEnabled(true);
        b8.setEnabled(true);
        b9.setEnabled(true);
        b0.setEnabled(true);
    }
}