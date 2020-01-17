package com.example.gyroaccdata;

import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.DialogInterface;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.text.Editable;
import android.text.TextWatcher;
import android.text.method.DialerKeyListener;
import android.text.method.KeyListener;
import android.util.Log;
import android.view.KeyEvent;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.TextView;
import android.widget.Toast;

import com.github.mikephil.charting.charts.LineChart;
import com.github.mikephil.charting.components.Description;
import com.github.mikephil.charting.components.Legend;
import com.github.mikephil.charting.components.XAxis;
import com.github.mikephil.charting.components.YAxis;
import com.github.mikephil.charting.data.Entry;
import com.github.mikephil.charting.data.LineData;
import com.github.mikephil.charting.data.LineDataSet;
import com.github.mikephil.charting.interfaces.datasets.ILineDataSet;
import com.opencsv.CSVWriter;

import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.text.DateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Date;
import java.util.List;

import static java.lang.Math.pow;

public class MainActivity extends AppCompatActivity implements SensorEventListener
{

	private SensorManager senSensorManager;
	private Sensor senAccelerometer;
	Button startButton;
	Button stopButton;
	EditText editText;
	TextView textView,textView2;
	boolean record=false;
	boolean record1=false;
	LineData ldata;
	Thread thread;
	boolean record11=false;

	Long start_time;
	Long press_time;
	Long key_down= Long.valueOf(0);
	Long key_up= Long.valueOf(0);

	LineData ldata1;
	Thread thread1;

	String baseDir = Environment.getExternalStorageDirectory().getAbsolutePath()+"/AccApp";
	String fileName;
	String filePath;
	File f;
	CSVWriter writer,writer1,writer2;

	LineChart chart;
	LineChart chart1;

	List<String[]> data = new ArrayList<String[]>();
	List<String[]> data1 = new ArrayList<String[]>();
	List<String[]> data2 = new ArrayList<String[]>();

	/*private final float[] accelerometerReading = new float[3];
	private final float[] magnetometerReading = new float[3];

	private final float[] rotationMatrix = new float[9];
	private final float[] orientationAngles = new float[3];*/

	@Override
	protected void onCreate(Bundle savedInstanceState) {
		super.onCreate(savedInstanceState);
		setContentView(R.layout.activity_main);
		startButton = findViewById(R.id.start_button);
		stopButton = findViewById(R.id.stop_button);
		editText = findViewById(R.id.editText);
		textView = findViewById(R.id.textView);
		textView2 = findViewById(R.id.textView2);

		verifyStoragePermissions(this);
		charting();

		startButton.setEnabled(true);
		stopButton.setEnabled(false);

//		editText.setCursorVisible(false);

		editText.setKeyListener(new KeyListener() {
			@Override
			public int getInputType() {
				return 2;
			}

			@Override
			public boolean onKeyDown(View view, Editable text, int keyCode, KeyEvent event) {
//				Log.d("Accapp","key : "+keyCode);
				key_down=System.currentTimeMillis();
				String key="0";
				switch(keyCode)
				{
					case 7:
						key="0";
						break;
					case 8:
						key="1";
						break;
					case 9:
						key="2";
						break;
					case 10:
						key="3";
						break;
					case 11:
						key="4";
						break;
					case 12:
						key="5";
						break;
					case 13:
						key="6";
						break;
					case 14:
						key="7";
						break;
					case 15:
						key="8";
						break;
					case 16:
						key="9";
						break;
				}
				if(keyCode==67 && text.length()!=0)
				{
//					editText.setText(text.delete(text.length()-1,text.length()));
					text.delete(text.length()-1,text.length());
				}
				else if(keyCode!=67)
				{
//					editText.setText(text.append(key));
					text.append(key);
				}
				return false;
			}

			@Override
			public boolean onKeyUp(View view, Editable text, int keyCode, KeyEvent event) {
				key_up=System.currentTimeMillis();
				return false;
			}

			@Override
			public boolean onKeyOther(View view, Editable text, KeyEvent event) {
				return false;
			}

			@Override
			public void clearMetaKeyState(View view, Editable content, int states) {

			}
		});

		startButton.setOnClickListener(view -> {

			record = true;
			record1=true;
			startButton.setEnabled(false);
			stopButton.setEnabled(true);

			//data -> acc
			//data1 -> gyro
			start_time=System.currentTimeMillis();
			data.add(new String[] {"Time","X","Y","Z"});
			data1.add(new String[] {"Time","X","Y","Z"});
			data2.add(new String[] {"Time","X","Y","Z"});
		});

		stopButton.setOnClickListener((view -> {
			record = false;
			record1=false;
			press_time-=start_time;

			startButton.setEnabled(true);
			stopButton.setEnabled(false);

			/*Log.d("Accapp","key down : " + (key_down-start_time));
			Log.d("Accapp","key up : " + (key_up-start_time));*/

			key_down-=start_time;
			key_up-=start_time;

			//Acceleromoter

			String written=editText.getText().toString();
			String lastch;
			if (written.length()==0)
			{
				lastch="1";
			}
			else
			{
				lastch=written.substring(written.length() - 1);
			}
			fileName= DateFormat.getDateTimeInstance().format(new Date()).replaceAll(" ","_")+lastch+key_down+"&"+key_up+".csv";
			filePath = baseDir + "/Accelerometer" + File.separator + fileName;
			File createFolder=new File(baseDir + "/Accelerometer");
			createFolder.mkdirs();
			f = new File(filePath);
			try {
				f.createNewFile();
			} catch (IOException e) {
				e.printStackTrace();
				Log.println(Log.INFO,"Accapp","unable to create file");
			}
			Log.println(Log.INFO,"Accapp","file name : "+filePath);
			try {
				writer = new CSVWriter(new FileWriter(filePath));
			} catch (IOException e) {
				e.printStackTrace();
				Toast.makeText(getBaseContext(),"File nai bani",Toast.LENGTH_LONG).show();
			}

			//gyro-----------------------------------------------------
			fileName= DateFormat.getDateTimeInstance().format(new Date()).replaceAll(" ","_")+lastch+key_down+"&"+key_up+".csv";
//			fileName= DateFormat.getDateTimeInstance().format(new Date()).replaceAll(" ","_")+".csv";
			filePath = baseDir + "/Gyro" + File.separator + fileName;
			createFolder=new File(baseDir + "/Gyro");
			createFolder.mkdirs();
			f = new File(filePath);
			try {
				f.createNewFile();
			} catch (IOException e) {
				e.printStackTrace();
				Log.println(Log.INFO,"Accapp","unable to create file");
			}
			Log.println(Log.INFO,"Accapp","file name : "+filePath);
			try {
				writer1 = new CSVWriter(new FileWriter(filePath));
			} catch (IOException e) {
				e.printStackTrace();
				Toast.makeText(getBaseContext(),"File nai bani",Toast.LENGTH_LONG).show();
			}

			//gravity

			fileName= DateFormat.getDateTimeInstance().format(new Date()).replaceAll(" ","_")+lastch+press_time+".csv";
//			fileName= DateFormat.getDateTimeInstance().format(new Date()).replaceAll(" ","_")+".csv";
			filePath = baseDir + "/Grav" + File.separator + fileName;
			createFolder=new File(baseDir + "/Grav");
			createFolder.mkdirs();
			f = new File(filePath);
			try {
				f.createNewFile();
			} catch (IOException e) {
				e.printStackTrace();
				Log.println(Log.INFO,"Accapp","unable to create file");
			}
			Log.println(Log.INFO,"Accapp","file name : "+filePath);
			try {
				writer2 = new CSVWriter(new FileWriter(filePath));
			} catch (IOException e) {
				e.printStackTrace();
				Toast.makeText(getBaseContext(),"File nai bani",Toast.LENGTH_LONG).show();
			}

			//writer1 -> gyro
			//writer -> acc
			//data -> acc
			//data1 -> gyro
			writer2.writeAll(data2);
			writer1.writeAll(data1);
			writer.writeAll(data);
			data.clear();
			data1.clear();
			data2.clear();

			try {
				writer.close();
				writer1.close();
				writer2.close();
			} catch (IOException e) {
				e.printStackTrace();
			}
		}));

		editText.addTextChangedListener(new TextWatcher() {
			@Override
			public void beforeTextChanged(CharSequence s, int start, int count, int after) {

			}

			@Override
			public void onTextChanged(CharSequence s, int start, int before, int count) {
				press_time=System.currentTimeMillis();
			}

			@Override
			public void afterTextChanged(Editable s) {

			}
		});

//      acc
		senSensorManager = (SensorManager) getSystemService(Context.SENSOR_SERVICE);
		senAccelerometer = senSensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
//		senSensorManager.registerListener(this, senAccelerometer , SensorManager.SENSOR_DELAY_NORMAL);
		senSensorManager.registerListener(this, senAccelerometer ,(int)pow(10,4));

//        gyro
//		SensorManager sensorManager = (SensorManager) getSystemService(Context.SENSOR_SERVICE);;
		Sensor gyroscopeSensor = senSensorManager.getDefaultSensor(Sensor.TYPE_GYROSCOPE);
		senSensorManager.registerListener(this,gyroscopeSensor,(int)pow(10,4));

		Sensor gravitySensor = senSensorManager.getDefaultSensor(Sensor.TYPE_GRAVITY);
		senSensorManager.registerListener(this,gravitySensor,(int)pow(10,4));

		//magnetic field (magnetometer)
		/*Sensor magneticField = senSensorManager.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD);
		if(magneticField==null)
		{
			Log.d("Accapp","no magnet");
		}
		else
		{
			senSensorManager.registerListener(this, magneticField, 1000);
			Log.d("Accapp","magnet");
		}*/

//		Log.println(Log.INFO,"Accapp",gyroscopeSensor.toString());
		// Create a listener
		/*SensorEventListener gyroscopeSensorListener = new SensorEventListener() {
			@Override
			public void onSensorChanged(SensorEvent sensorEvent) {
				// More code goes here
				Sensor mySensor = sensorEvent.sensor;

				if (mySensor.getType() == Sensor.TYPE_GYROSCOPE) {
					float x = sensorEvent.values[0];
					float y = sensorEvent.values[1];
					float z = sensorEvent.values[2];

//					String temp= Calendar.getInstance().getTime().toString().replaceAll(":","");
//					String T[] = temp.split(" ");
					Long sub=System.currentTimeMillis();

					String X=Float.toString(x);
					String Y=Float.toString(y);
					String Z=Float.toString(z);

					if(record == true && record1==true){
//						data1.add(new String[] {T[3],X,Y,Z});
						data1.add(new String[] {Long.toString(sub-start_time),X,Y,Z});
						textView2.setText("Gyro Values\n"+X+"\n"+Y+"\n"+Z);
						addEntry(sensorEvent);
						record = false;

					}

				}

			}

			@Override
			public void onAccuracyChanged(Sensor sensor, int i) {
			}
		};

		// Register the listener
		sensorManager.registerListener(gyroscopeSensorListener,
				gyroscopeSensor, 1000);*/

		feedMultiple();
		feedMultiple1();
	}

	@Override
	public void onSensorChanged(SensorEvent sensorEvent) {
		Sensor mySensor = sensorEvent.sensor;

		if (mySensor.getType() == Sensor.TYPE_ACCELEROMETER) {
//			System.arraycopy(sensorEvent.values, 0, accelerometerReading,0, accelerometerReading.length);
			float x = sensorEvent.values[0];
			float y = sensorEvent.values[1];
			float z = sensorEvent.values[2];

//			String temp= Calendar.getInstance().getTime().toString().replaceAll(":","");
//			String T[] = temp.split(" ");
			Long sub=System.currentTimeMillis();

			String X=Float.toString(x);
			String Y=Float.toString(y);
			String Z=Float.toString(z);

			if(record11 == true && record1==true){
//				data.add(new String[] {T[3],X,Y,Z});
				data.add(new String[] {Long.toString(sub-start_time),X,Y,Z});
				textView.setText("Acclero Values\n"+X+"\n"+Y+"\n"+Z);
				addEntry1(sensorEvent);
				record11 = false;

			}

		}

		else if (mySensor.getType() == Sensor.TYPE_GYROSCOPE) {
			float x = sensorEvent.values[0];
			float y = sensorEvent.values[1];
			float z = sensorEvent.values[2];

//			String temp= Calendar.getInstance().getTime().toString().replaceAll(":","");
//			String T[] = temp.split(" ");
			Long sub=System.currentTimeMillis();

			String X=Float.toString(x);
			String Y=Float.toString(y);
			String Z=Float.toString(z);

			if(record == true && record1==true){
//				data1.add(new String[] {T[3],X,Y,Z});
				data1.add(new String[] {Long.toString(sub-start_time),X,Y,Z});
//				textView2.setText("Gyro Values\n"+X+"\n"+Y+"\n"+Z);
				addEntry(sensorEvent);
				record = false;

			}

		}

		if (mySensor.getType() == Sensor.TYPE_GRAVITY) {
//			System.arraycopy(sensorEvent.values, 0, accelerometerReading,0, accelerometerReading.length);
			float x = sensorEvent.values[0];
			float y = sensorEvent.values[1];
			float z = sensorEvent.values[2];

//			String temp= Calendar.getInstance().getTime().toString().replaceAll(":","");
//			String T[] = temp.split(" ");
			Long sub=System.currentTimeMillis();

			String X=Float.toString(x);
			String Y=Float.toString(y);
			String Z=Float.toString(z);

			if(record1==true){
//				data.add(new String[] {T[3],X,Y,Z});
				data2.add(new String[] {Long.toString(sub-start_time),X,Y,Z});
				textView.setText("Acclero Values\n"+X+"\n"+Y+"\n"+Z);
			}

		}

		/*else if (mySensor.getType() == Sensor.TYPE_MAGNETIC_FIELD)
		{
			Log.d("Accapp","magnet");
			System.arraycopy(sensorEvent.values, 0, magnetometerReading,0, magnetometerReading.length);
			// Update rotation matrix, which is needed to update orientation angles.
			SensorManager.getRotationMatrix(rotationMatrix, null,accelerometerReading, magnetometerReading);
			// "mRotationMatrix" now has up-to-date information.
			SensorManager.getOrientation(rotationMatrix, orientationAngles);
			// "mOrientationAngles" now has up-to-date information.
			textView2.setText("Magnet Values\n"+orientationAngles[0]+"\n"+orientationAngles[1]+"\n"+orientationAngles[2]);
		}*/
	}

	@Override
	public void onAccuracyChanged(Sensor sensor, int i) {

	}

	private void charting() {
		chart = findViewById(R.id.chartGyro);
		chart.getDescription().setEnabled(true);
		Description description=new Description();
		description.setText("Gyro values");
		chart.setDescription(description);

		// enable touch gestures
		chart.setTouchEnabled(true);

		// enable scaling and dragging
		chart.setDragEnabled(true);
		chart.setScaleEnabled(true);
		chart.setDrawGridBackground(false);

		// if disabled, scaling can be done on x- and y-axis separately
		chart.setPinchZoom(true);

		// set an alternative background color
		chart.setBackgroundColor(Color.WHITE);

		ldata=new LineData();
		ldata.setValueTextColor(Color.WHITE);
		// add empty data
		chart.setData(ldata);

		// get the legend (only possible after setting data)
		Legend l = chart.getLegend();

		// modify the legend ...
		l.setForm(Legend.LegendForm.LINE);
		l.setTextColor(Color.BLACK);

		XAxis xl = chart.getXAxis();
		xl.setTextColor(Color.BLACK);
		xl.setDrawGridLines(true);
		xl.setAvoidFirstLastClipping(true);
		xl.setEnabled(true);

		YAxis leftAxis = chart.getAxisLeft();
		leftAxis.setTextColor(Color.BLACK);
		leftAxis.setDrawGridLines(false);
		/*leftAxis.setAxisMaximum(5.01f);
		leftAxis.setAxisMinimum(4.99f);*/
		leftAxis.setAxisMaximum(10f);
		leftAxis.setAxisMinimum(0f);
		leftAxis.setDrawGridLines(true);

		YAxis rightAxis = chart.getAxisRight();
		rightAxis.setEnabled(false);

		chart.getAxisLeft().setDrawGridLines(false);
		chart.getXAxis().setDrawGridLines(false);
		chart.setDrawBorders(false);

		//---------------acc-chart----------------------------------

		chart1 = findViewById(R.id.chartAcc);
		chart1.getDescription().setEnabled(true);
		Description description1=new Description();
		description1.setText("Acc values");
		chart1.setDescription(description1);

		// enable touch gestures
		chart1.setTouchEnabled(true);

		// enable scaling and dragging
		chart1.setDragEnabled(true);
		chart1.setScaleEnabled(true);
		chart1.setDrawGridBackground(false);

		// if disabled, scaling can be done on x- and y-axis separately
		chart1.setPinchZoom(true);

		// set an alternative background color
		chart1.setBackgroundColor(Color.WHITE);

		ldata1=new LineData();
		ldata1.setValueTextColor(Color.WHITE);
		// add empty data
		chart1.setData(ldata1);

		// get the legend (only possible after setting data)
		Legend l1 = chart1.getLegend();

		// modify the legend ...
		l1.setForm(Legend.LegendForm.LINE);
		l1.setTextColor(Color.BLACK);

		XAxis xl1 = chart1.getXAxis();
		xl1.setTextColor(Color.BLACK);
		xl1.setDrawGridLines(true);
		xl1.setAvoidFirstLastClipping(true);
		xl1.setEnabled(true);

		YAxis leftAxis1 = chart1.getAxisLeft();
		leftAxis1.setTextColor(Color.BLACK);
		leftAxis1.setDrawGridLines(false);
		leftAxis1.setAxisMaximum(10f);
		leftAxis1.setAxisMinimum(0f);
		leftAxis1.setDrawGridLines(true);

		YAxis rightAxis1 = chart1.getAxisRight();
		rightAxis1.setEnabled(false);

		chart1.getAxisLeft().setDrawGridLines(false);
		chart1.getXAxis().setDrawGridLines(false);
		chart1.setDrawBorders(false);
	}

	private void addEntry(SensorEvent event) {

		LineData data = chart.getData();

		if (data != null) {

			ILineDataSet set = data.getDataSetByIndex(0);
			ILineDataSet set1 = data.getDataSetByIndex(1);
			ILineDataSet set2 = data.getDataSetByIndex(2);
			// set.addEntry(...); // can be called as well

			if (set == null) {
				set = createSet();
				set1 = createSet1();
				set2 = createSet2();
				data.addDataSet(set);
				data.addDataSet(set1);
				data.addDataSet(set2);
			}
//            data.addEntry(new Entry(set.getEntryCount(), (float) (Math.random() * 80) + 10f), 0);

			data.addEntry(new Entry(set.getEntryCount(), event.values[0] + 5), 0);
			data.addEntry(new Entry(set.getEntryCount(), event.values[1] + 5), 1);
			data.addEntry(new Entry(set.getEntryCount(), event.values[2] + 5), 2);
			data.notifyDataChanged();

			// let the chart know it's data has changed
			chart.notifyDataSetChanged();

			// limit the number of visible entries
			chart.setVisibleXRangeMaximum(30);
			// mChart.setVisibleYRange(30, AxisDependency.LEFT);

			// move to the latest entry
			chart.moveViewToX(data.getEntryCount());

		}
	}
	private void addEntry1(SensorEvent event) {

		LineData data = chart1.getData();

		if (data != null) {

			ILineDataSet set = data.getDataSetByIndex(0);
			ILineDataSet set1 = data.getDataSetByIndex(1);
			ILineDataSet set2 = data.getDataSetByIndex(2);
			// set.addEntry(...); // can be called as well

			if (set == null) {
				set = createSet();
				set1 = createSet1();
				set2 = createSet2();
				data.addDataSet(set);
				data.addDataSet(set1);
				data.addDataSet(set2);
			}
//            data.addEntry(new Entry(set.getEntryCount(), (float) (Math.random() * 80) + 10f), 0);

			data.addEntry(new Entry(set.getEntryCount(), event.values[0] + 5), 0);
			data.addEntry(new Entry(set.getEntryCount(), event.values[1] + 5), 1);
			data.addEntry(new Entry(set.getEntryCount(), event.values[2] + 5), 2);
			data.notifyDataChanged();

			// let the chart know it's data has changed
			chart1.notifyDataSetChanged();

			// limit the number of visible entries
			chart1.setVisibleXRangeMaximum(30);
			// mChart.setVisibleYRange(30, AxisDependency.LEFT);

			// move to the latest entry
			chart1.moveViewToX(data.getEntryCount());

		}
	}

	private LineDataSet createSet() {

		LineDataSet set = new LineDataSet(null, "x axis");
		set.setAxisDependency(YAxis.AxisDependency.LEFT);
		set.setLineWidth(1f);
		set.setColor(Color.RED);
		set.setHighlightEnabled(false);
		set.setDrawValues(false);
		set.setDrawCircles(false);
		set.setMode(LineDataSet.Mode.CUBIC_BEZIER);
		set.setCubicIntensity(0.2f);
		return set;
	}

	private LineDataSet createSet1() {

		LineDataSet set = new LineDataSet(null, "y axis");
		set.setAxisDependency(YAxis.AxisDependency.LEFT);
		set.setLineWidth(1f);
		set.setColor(Color.BLUE);
		set.setHighlightEnabled(false);
		set.setDrawValues(false);
		set.setDrawCircles(false);
		set.setMode(LineDataSet.Mode.CUBIC_BEZIER);
		set.setCubicIntensity(0.2f);
		return set;
	}

	private LineDataSet createSet2() {

		LineDataSet set = new LineDataSet(null, "z axis");
		set.setAxisDependency(YAxis.AxisDependency.LEFT);
		set.setLineWidth(1f);
		set.setColor(Color.GREEN);
		set.setHighlightEnabled(false);
		set.setDrawValues(false);
		set.setDrawCircles(false);
		set.setMode(LineDataSet.Mode.CUBIC_BEZIER);
		set.setCubicIntensity(0.2f);
		return set;
	}

	private void feedMultiple() {

		if (thread != null){
			thread.interrupt();
		}

		thread = new Thread(new Runnable() {

			@Override
			public void run() {
				while (true){
					record = true;
					try {
						Thread.sleep(10);
					} catch (InterruptedException e) {
						// TODO Auto-generated catch block
						e.printStackTrace();
					}
				}
			}
		});

		thread.start();
	}

	private void feedMultiple1() {

		if (thread1 != null){
			thread1.interrupt();
		}

		thread1 = new Thread(new Runnable() {

			@Override
			public void run() {
				while (true){
					record11 = true;
					try {
						Thread.sleep(10);
					} catch (InterruptedException e) {
						// TODO Auto-generated catch block
						e.printStackTrace();
					}
				}
			}
		});

		thread1.start();
	}


	private static final int REQUEST_EXTERNAL_STORAGE = 1;
	private static String[] PERMISSIONS_STORAGE = {
			Manifest.permission.READ_EXTERNAL_STORAGE,
			Manifest.permission.WRITE_EXTERNAL_STORAGE
	};

	public static void verifyStoragePermissions(Activity activity) {
		// Check if we have write permission
		int permission = ActivityCompat.checkSelfPermission(activity, Manifest.permission.WRITE_EXTERNAL_STORAGE);

		if (permission != PackageManager.PERMISSION_GRANTED) {
			// We don't have permission so prompt the user
			ActivityCompat.requestPermissions(
					activity,
					PERMISSIONS_STORAGE,
					REQUEST_EXTERNAL_STORAGE
			);
		}
	}
}
